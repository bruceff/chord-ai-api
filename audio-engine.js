import Meyda from "meyda";
import WavDecoder from "wav-decoder";


/* =========================================
   CHORD AI — AUDIO ENGINE v2.1

   WAV
    ↓
   PCM mono
    ↓
   frames espectrais
    ↓
   chroma
    ↓
   filtro de silêncio corrigido
    ↓
   agregação temporal
    ↓
   seleção inteligente de notas
    ↓
   Chord Engine
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
   UTILIDADES
========================================= */

function clamp(
  value,
  min,
  max
){

  return Math.max(
    min,
    Math.min(
      max,
      value
    )
  );

}


function median(values){

  if(
    !Array.isArray(values)
    ||
    values.length === 0
  ){

    return 0;

  }


  const sorted =
    [...values]
      .sort(
        (a,b) =>
          a - b
      );


  const middle =
    Math.floor(
      sorted.length / 2
    );


  if(
    sorted.length % 2 === 0
  ){

    return (
      sorted[middle - 1]
      +
      sorted[middle]
    ) / 2;

  }


  return sorted[middle];

}


/* =========================================
   NORMALIZAR CHROMA
========================================= */

function normalizeChroma(
  chroma
){

  if(
    !chroma
    ||
    typeof chroma.length !== "number"
    ||
    chroma.length !== 12
  ){

    return null;

  }


  const values =
    Array.from(chroma)
      .map(
        value => {

          const number =
            Number(value);

          if(
            !Number.isFinite(number)
          ){

            return 0;

          }


          return Math.max(
            0,
            number
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
   CHROMA -> NOTAS
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


  const maxNotes =
    Number.isFinite(
      Number(
        options.maxNotes
      )
    )
    ?
    clamp(
      Math.floor(
        Number(
          options.maxNotes
        )
      ),
      1,
      8
    )
    :
    5;


  const relativeThreshold =
    Number.isFinite(
      Number(
        options.threshold
      )
    )
    ?
    clamp(
      Number(
        options.threshold
      ),
      0.20,
      0.95
    )
    :
    0.62;


  const minimumEnergy =
    Number.isFinite(
      Number(
        options.minimumEnergy
      )
    )
    ?
    Number(
      options.minimumEnergy
    )
    :
    0.18;


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


  if(
    ranked.length === 0
    ||
    ranked[0].energy <= 0
  ){

    return [];

  }


  const strongest =
    ranked[0].energy;


  let candidates =
    ranked.filter(
      item => {

        if(
          item.energy <
          minimumEnergy
        ){

          return false;

        }


        return (
          item.energy
          >=
          strongest
          *
          relativeThreshold
        );

      }
    );


  /*
    Se as três primeiras notas
    forem fortes e a quarta muito
    mais fraca, mantemos só três.
  */

  if(
    candidates.length >= 4
  ){

    const third =
      candidates[2].energy;

    const fourth =
      candidates[3].energy;


    if(
      fourth <
      third * 0.72
    ){

      candidates =
        candidates.slice(
          0,
          3
        );

    }

  }


  candidates =
    candidates.slice(
      0,
      maxNotes
    );


  /*
    Uma única nota não é
    suficiente para um acorde.
  */

  if(
    candidates.length < 2
  ){

    return [];

  }


  return candidates
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
   ANALISAR UM FRAME
========================================= */

export function analyzeAudioFrame(
  samples,
  sampleRate,
  options = {}
){

  if(
    !samples
    ||
    typeof samples.length !== "number"
    ||
    samples.length === 0
  ){

    return {

      valid:false,

      error:
        "Frame de áudio vazio"

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

      error:
        "sampleRate inválido"

    };

  }


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


  if(!chroma){

    return {

      valid:false,

      error:
        "Chroma inválido"

    };

  }


  const rms =
    Number(
      features.rms || 0
    );


  return {

    valid:true,

    chroma,

    rms,

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
   MEDIANA DE CHROMAS
========================================= */

export function medianChroma(
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


  const valid =
    chromaFrames
      .map(
        frame =>
          normalizeChroma(
            frame
          )
      )
      .filter(Boolean);


  if(
    valid.length === 0
  ){

    return null;

  }


  const result =
    new Array(12)
      .fill(0);


  for(
    let pitch = 0;
    pitch < 12;
    pitch++
  ){

    result[pitch] =
      median(
        valid.map(
          chroma =>
            chroma[pitch]
        )
      );

  }


  return normalizeChroma(
    result
  );

}


/* =========================================
   MÉDIA DE CHROMAS
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
   SUAVIZAÇÃO
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
        medianChroma(
          nearby
        );


      return {

        ...frame,

        chroma,

        notes:
          chroma
          ?
          chromaToNotes(
            chroma,
            {
              threshold:
                0.62,

              maxNotes:
                5
            }
          )
          :
          []

      };

    }
  );

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
      buffer.byteOffset
      +
      buffer.byteLength
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
    Math.min(
      ...channelData.map(
        channel =>
          channel.length
      )
    );


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
   LIMIAR DE SILÊNCIO — CORRIGIDO
========================================= */

function calculateRmsFloor(
  frames
){

  if(
    !Array.isArray(frames)
    ||
    frames.length === 0
  ){

    return 0.0005;

  }


  const values =
    frames
      .map(
        frame =>
          Number(
            frame.rms || 0
          )
      )
      .filter(
        value =>
          Number.isFinite(value)
          &&
          value >= 0
      )
      .sort(
        (a,b) =>
          a - b
      );


  if(
    values.length === 0
  ){

    return 0.0005;

  }


  const maxRms =
    values[
      values.length - 1
    ];


  if(
    maxRms <= 0
  ){

    return 0.0005;

  }


  const percentileIndex =
    Math.floor(
      values.length * 0.10
    );


  const lowLevel =
    values[
      Math.min(
        percentileIndex,
        values.length - 1
      )
    ];


  /*
    Nunca exigimos mais
    de 8% do pico da música.
  */

  const relativeFloor =
    maxRms * 0.08;


  /*
    Se houver silêncio real,
    lowLevel tende a ser baixo.

    Se a música for contínua,
    impedimos o threshold de
    subir demais.
  */

  const adaptiveFloor =
    Math.min(
      lowLevel * 1.35,
      relativeFloor
    );


  return Math.max(
    0.0003,
    adaptiveFloor
  );

}


/* =========================================
   AGRUPAR FRAMES EM JANELAS MUSICAIS
========================================= */

function aggregateFrames(
  rawFrames,
  options = {}
){

  if(
    !Array.isArray(rawFrames)
    ||
    rawFrames.length === 0
  ){

    return [];

  }


  const windowSeconds =
    Number.isFinite(
      Number(
        options.windowSeconds
      )
    )
    ?
    clamp(
      Number(
        options.windowSeconds
      ),
      0.12,
      1.0
    )
    :
    0.28;


  const hopSeconds =
    Number.isFinite(
      Number(
        options.decisionHopSeconds
      )
    )
    ?
    clamp(
      Number(
        options.decisionHopSeconds
      ),
      0.08,
      windowSeconds
    )
    :
    0.20;


  const rmsFloor =
    calculateRmsFloor(
      rawFrames
    );


  console.log(
    "[Audio Engine] RMS floor:",
    rmsFloor
  );


  const lastFrame =
    rawFrames[
      rawFrames.length - 1
    ];


  const duration =
    lastFrame.time;


  const output = [];


  for(
    let startTime = 0;
    startTime <= duration;
    startTime += hopSeconds
  ){

    const endTime =
      startTime
      +
      windowSeconds;


    const members =
      rawFrames.filter(
        frame =>
          frame.time >= startTime
          &&
          frame.time < endTime
          &&
          frame.rms >= rmsFloor
      );


    if(
      members.length === 0
    ){

      output.push({

        time:
          startTime,

        chroma:
          null,

        notes:
          [],

        rms:
          0,

        silence:
          true,

        sourceFrames:
          0

      });


      continue;

    }


    const chroma =
      medianChroma(
        members.map(
          frame =>
            frame.chroma
        )
      );


    const rms =
      median(
        members.map(
          frame =>
            frame.rms
        )
      );


    const notes =
      chroma
      ?
      chromaToNotes(
        chroma,
        {

          threshold:
            Number.isFinite(
              Number(
                options.threshold
              )
            )
            ?
            Number(
              options.threshold
            )
            :
            0.62,

          maxNotes:
            Number.isFinite(
              Number(
                options.maxNotes
              )
            )
            ?
            Number(
              options.maxNotes
            )
            :
            5

        }
      )
      :
      [];


    output.push({

      time:
        startTime,

      chroma,

      notes,

      rms,

      silence:
        false,

      sourceFrames:
        members.length

    });


    /*
      Diagnóstico dos primeiros
      frames musicais.
    */

    if(
      output.length <= 10
    ){

      console.log(
        "[Audio Engine]",
        startTime.toFixed(2),
        "s | RMS:",
        rms.toFixed(4),
        "| notas:",
        notes.join(",")
      );

    }

  }


  return output;

}


/* =========================================
   PERSISTÊNCIA DAS NOTAS
========================================= */

function enforceNotePersistence(
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


  return frames.map(
    (frame,index) => {

      if(
        !frame.notes
        ||
        frame.notes.length === 0
      ){

        return {
          ...frame,
          notes:[]
        };

      }


      const start =
        Math.max(
          0,
          index - radius
        );


      const end =
        Math.min(
          frames.length - 1,
          index + radius
        );


      const count = {};


      for(
        let i = start;
        i <= end;
        i++
      ){

        const notes =
          frames[i].notes || [];


        for(
          const note
          of notes
        ){

          count[note] =
            (
              count[note] || 0
            )
            +
            1;

        }

      }


      const neighborhoodSize =
        end - start + 1;


      let persistent =
        frame.notes.filter(
          note =>
            (
              count[note] || 0
            )
            >=
            Math.ceil(
              neighborhoodSize * 0.5
            )
        );


      /*
        Não deixa um acorde sumir
        por diferença pequena.
      */

      if(
        persistent.length < 2
        &&
        frame.notes.length >= 2
      ){

        persistent =
          frame.notes.slice(
            0,
            3
          );

      }


      return {

        ...frame,

        notes:
          persistent

      };

    }
  );

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


  if(
    mono.length === 0
  ){

    throw new Error(
      "WAV sem amostras"
    );

  }


  const frameSize =
    Number.isFinite(
      Number(
        options.frameSize
      )
    )
    ?
    Math.floor(
      Number(
        options.frameSize
      )
    )
    :
    4096;


  const hopSize =
    Number.isFinite(
      Number(
        options.hopSize
      )
    )
    ?
    Math.floor(
      Number(
        options.hopSize
      )
    )
    :
    2048;


  const rawFrames = [];


  /* =====================================
     1. EXTRAÇÃO BRUTA
  ===================================== */

  for(
    let start = 0;
    start + frameSize <= mono.length;
    start += hopSize
  ){

    const samples =
      mono.slice(
        start,
        start + frameSize
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


    rawFrames.push({

      time:
        start / sampleRate,

      chroma:
        analysis.chroma,

      rms:
        analysis.rms,

      spectralCentroid:
        analysis.spectralCentroid,

      spectralFlatness:
        analysis.spectralFlatness

    });

  }


  if(
    rawFrames.length === 0
  ){

    throw new Error(
      "Nenhum frame de áudio pôde ser analisado"
    );

  }


  /* =====================================
     2. AGREGAÇÃO TEMPORAL
  ===================================== */

  let decisionFrames =
    aggregateFrames(
      rawFrames,
      {

        threshold:
          Number.isFinite(
            Number(
              options.threshold
            )
          )
          ?
          Number(
            options.threshold
          )
          :
          0.62,

        maxNotes:
          Number.isFinite(
            Number(
              options.maxNotes
            )
          )
          ?
          Number(
            options.maxNotes
          )
          :
          5,

        windowSeconds:
          Number.isFinite(
            Number(
              options.windowSeconds
            )
          )
          ?
          Number(
            options.windowSeconds
          )
          :
          0.28,

        decisionHopSeconds:
          Number.isFinite(
            Number(
              options.decisionHopSeconds
            )
          )
          ?
          Number(
            options.decisionHopSeconds
          )
          :
          0.20

      }
    );


  /* =====================================
     3. PERSISTÊNCIA DAS NOTAS
  ===================================== */

  decisionFrames =
    enforceNotePersistence(
      decisionFrames,
      1
    );


  /* =====================================
     4. NORMALIZAR FRAMES SEM HARMONIA
  ===================================== */

  const usefulFrames =
    decisionFrames.map(
      frame => {

        if(
          frame.silence
          ||
          !frame.notes
          ||
          frame.notes.length < 2
        ){

          return {

            ...frame,

            notes:[]

          };

        }


        return frame;

      }
    );


  return {

    sampleRate,

    duration:
      mono.length
      /
      sampleRate,

    rawFrameCount:
      rawFrames.length,

    frameCount:
      usefulFrames.length,

    frames:
      usefulFrames

  };

}


/* =========================================
   TESTE INTERNO DE CHROMA
========================================= */

export function createChromaTest(
  notes
){

  if(
    !Array.isArray(
      notes
    )
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

    const normalized =
      String(note)
        .trim()
        .toUpperCase();


    const index =
      NOTE_NAMES.indexOf(
        normalized
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

          threshold:
            0.5,

          maxNotes:
            6

        }
      )

  };

}
