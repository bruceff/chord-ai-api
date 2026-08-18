import Meyda from "meyda";
import WavDecoder from "wav-decoder";

/* =========================================
   CHORD AI — AUDIO ENGINE

   Converte frames de áudio em informações
   harmônicas que depois serão enviadas ao
   chord-engine.
========================================= */


const NOTE_NAMES = [

  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B"

];


/* =========================================
   NORMALIZAR CHROMA
========================================= */

function normalizeChroma(
  chroma
){

  if(
    !Array.isArray(chroma)
    ||
    chroma.length !== 12
  ){

    return null;

  }


  const values =
    chroma.map(
      value => {

        const number =
          Number(value);

        return (
          Number.isFinite(number)
          ?
          Math.max(
            0,
            number
          )
          :
          0
        );

      }
    );


  const max =
    Math.max(
      ...values
    );


  if(
    max <= 0
  ){

    return new Array(12)
      .fill(0);

  }


  return values.map(
    value =>
      value / max
  );

}


/* =========================================
   CHROMA -> NOTAS PROVÁVEIS
========================================= */

export function chromaToNotes(
  chroma,
  options = {}
){

  const normalized =
    normalizeChroma(
      chroma
    );


  if(!normalized){

    return [];

  }


  const threshold =
    Number.isFinite(
      options.threshold
    )
    ?
    options.threshold
    :
    0.58;


  const maxNotes =
    Number.isFinite(
      options.maxNotes
    )
    ?
    Math.max(
      1,
      Math.floor(
        options.maxNotes
      )
    )
    :
    6;


  const ranked =
    normalized
      .map(
        (energy,index) => ({

          note:
            NOTE_NAMES[index],

          index,

          energy

        })
      )

      .sort(
        (a,b) =>
          b.energy -
          a.energy
      );


  const notes =
    ranked
      .filter(
        item =>
          item.energy >=
          threshold
      )

      .slice(
        0,
        maxNotes
      );


  /*
    Caso nenhuma nota passe
    pelo threshold, preservamos
    pelo menos a dominante.
  */

  if(
    notes.length === 0
    &&
    ranked[0]
    &&
    ranked[0].energy > 0
  ){

    return [
      ranked[0].note
    ];

  }


  /*
    Ordenamos novamente por pitch class,
    para não depender da força da nota
    na saída final.
  */

  return notes
    .sort(
      (a,b) =>
        a.index -
        b.index
    )
    .map(
      item =>
        item.note
    );

}


/* =========================================
   ANALISAR UM FRAME DE ÁUDIO
========================================= */

export function analyzeAudioFrame(
  samples,
  sampleRate,
  options = {}
){

  if(
    !samples
    ||
    typeof samples.length !==
      "number"
    ||
    samples.length === 0
  ){

    return {
      valid:false,
      error:"Frame de áudio vazio"
    };

  }


  const rate =
    Number(
      sampleRate
    );


  if(
    !Number.isFinite(rate)
    ||
    rate <= 0
  ){

    return {
      valid:false,
      error:"sampleRate inválido"
    };

  }


  /*
    O Meyda trabalha melhor com
    tamanho de buffer conhecido.

    Aqui usamos o tamanho do frame.
  */

  Meyda.sampleRate =
    rate;

  Meyda.bufferSize =
    samples.length;

  Meyda.chromaBands =
    12;


  let features;


  try{

    features =
      Meyda.extract(

        [
          "chroma",
          "rms",
          "spectralCentroid",
          "spectralFlatness"
        ],

        samples

      );

  }
  catch(error){

    return {

      valid:false,

      error:
        "Falha ao extrair features",

      detail:
        error.message

    };

  }


  if(
    !features
    ||
    !features.chroma
  ){

    return {

      valid:false,

      error:
        "Chroma não disponível"

    };

  }


  const chroma =
    normalizeChroma(
      features.chroma
    );


  const notes =
    chromaToNotes(
      chroma,
      {

        threshold:
          options.threshold,

        maxNotes:
          options.maxNotes

      }
    );


  return {

    valid:true,

    chroma,

    notes,

    rms:
      Number(
        features.rms || 0
      ),

    spectralCentroid:
      Number(
        features.spectralCentroid || 0
      ),

    spectralFlatness:
      Number(
        features.spectralFlatness || 0
      )

  };

}


/* =========================================
   MÉDIA DE VÁRIOS CHROMAS
========================================= */

export function averageChroma(
  chromaFrames
){

  if(
    !Array.isArray(
      chromaFrames
    )
    ||
    chromaFrames.length === 0
  ){

    return null;

  }


  const result =
    new Array(12)
      .fill(0);


  let count = 0;


  for(
    const frame
    of chromaFrames
  ){

    const chroma =
      normalizeChroma(
        frame
      );


    if(!chroma)
      continue;


    for(
      let i = 0;
      i < 12;
      i++
    ){

      result[i] +=
        chroma[i];

    }


    count++;

  }


  if(
    count === 0
  ){

    return null;

  }


  return normalizeChroma(

    result.map(
      value =>
        value / count
    )

  );

}


/* =========================================
   SUAVIZAR SEQUÊNCIA DE CHROMA
========================================= */

export function smoothChromaFrames(
  frames,
  radius = 1
){

  if(
    !Array.isArray(frames)
    ||
    frames.length === 0
  ){

    return [];

  }


  const r =
    Math.max(
      0,
      Math.floor(
        Number(radius) || 0
      )
    );


  return frames.map(
    (frame,index) => {

      const start =
        Math.max(
          0,
          index - r
        );


      const end =
        Math.min(
          frames.length - 1,
          index + r
        );


      const nearby =
        [];


      for(
        let i = start;
        i <= end;
        i++
      ){

        if(
          frames[i]
          &&
          frames[i].chroma
        ){

          nearby.push(
            frames[i].chroma
          );

        }

      }


      const chroma =
        averageChroma(
          nearby
        );


      return {

        ...frame,

        chroma,

        notes:
          chroma
          ?
          chromaToNotes(
            chroma
          )
          :
          []

      };

    }
  );

}


/* =========================================
   TESTE INTERNO DE CHROMA

   Isso não analisa áudio real.
   Serve apenas para validar o pipeline
   Chroma -> notas.
========================================= */

export function createChromaTest(
  notes
){

  if(
    !Array.isArray(notes)
  ){

    return null;

  }


  const chroma =
    new Array(12)
      .fill(0);


  for(
    const note
    of notes
  ){

    const index =
      NOTE_NAMES.indexOf(
        String(note)
          .toUpperCase()
      );


    if(
      index >= 0
    ){

      chroma[index] =
        1;

    }

  }


  return {

    chroma,

    notes:
      chromaToNotes(
        chroma,
        {
          threshold:0.5
        }
      )

  };

}
/* =========================================
   DECODIFICAR WAV
========================================= */

export async function decodeWavBuffer(
  buffer
){

  if(
    !buffer
    ||
    buffer.length === 0
  ){

    throw new Error(
      "Áudio vazio"
    );

  }


  const arrayBuffer =
    buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );


  const decoded =
    await WavDecoder.decode(
      arrayBuffer
    );


  if(
    !decoded
    ||
    !decoded.sampleRate
    ||
    !Array.isArray(
      decoded.channelData
    )
    ||
    decoded.channelData.length === 0
  ){

    throw new Error(
      "WAV inválido"
    );

  }


  return decoded;

}


/* =========================================
   CONVERTER PARA MONO
========================================= */

export function toMono(
  channelData
){

  if(
    !Array.isArray(
      channelData
    )
    ||
    channelData.length === 0
  ){

    return new Float32Array();
  }


  if(
    channelData.length === 1
  ){

    return channelData[0];
  }


  const length =
    channelData[0].length;


  const mono =
    new Float32Array(
      length
    );


  for(
    let channel = 0;
    channel < channelData.length;
    channel++
  ){

    const samples =
      channelData[channel];


    for(
      let i = 0;
      i < length;
      i++
    ){

      mono[i] +=
        samples[i]
        /
        channelData.length;

    }

  }


  return mono;

}


/* =========================================
   ANALISAR WAV COMPLETO
========================================= */

export async function analyzeWavBuffer(
  buffer,
  options = {}
){

  const decoded =
    await decodeWavBuffer(
      buffer
    );


  const sampleRate =
    decoded.sampleRate;


  const mono =
    toMono(
      decoded.channelData
    );


  const frameSize =
    Number.isFinite(
      options.frameSize
    )
    ?
    Math.floor(
      options.frameSize
    )
    :
    4096;


  const hopSize =
    Number.isFinite(
      options.hopSize
    )
    ?
    Math.floor(
      options.hopSize
    )
    :
    2048;


  const frames = [];


  for(
    let start = 0;
    start + frameSize <= mono.length;
    start += hopSize
  ){

    const end =
      start + frameSize;


    const samples =
      mono.slice(
        start,
        end
      );


    const analysis =
      analyzeAudioFrame(
        samples,
        sampleRate,
        options
      );


    if(
      !analysis.valid
    ){

      continue;

    }


    frames.push({

      time:
        start
        /
        sampleRate,

      chroma:
        analysis.chroma,

      notes:
        analysis.notes,

      rms:
        analysis.rms,

      spectralCentroid:
        analysis.spectralCentroid,

      spectralFlatness:
        analysis.spectralFlatness

    });

  }


  const smoothed =
    smoothChromaFrames(
      frames,
      2
    );


  return {

    sampleRate,

    duration:
      mono.length
      /
      sampleRate,

    frameCount:
      smoothed.length,

    frames:
      smoothed

  };

}
