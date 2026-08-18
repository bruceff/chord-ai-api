import Meyda from "meyda";


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
