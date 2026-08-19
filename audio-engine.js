import Meyda from "meyda";
import WavDecoder from "wav-decoder";


/* =========================================
   CHORD AI — AUDIO ENGINE v3

   WAV
    ↓
   PCM mono
    ↓
   frames
    ├── full chroma
    └── bass detector
          ↓
       bassChroma
          ↓
       bassNote
========================================= */


/* =========================================
   NOTAS
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
   FREQUÊNCIAS BASE

   C1 → B1 aproximadamente.

   Depois analisamos múltiplas oitavas
   da mesma pitch class.
========================================= */

const BASS_BASE_FREQUENCIES = [

  32.7032, // C1
  34.6478, // C#1
  36.7081, // D1
  38.8909, // D#1
  41.2034, // E1
  43.6535, // F1
  46.2493, // F#1
  48.9994, // G1
  51.9131, // G#1
  55.0000, // A1
  58.2705, // A#1
  61.7354  // B1

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
   NORMALIZAR ARRAY DE 12 VALORES
========================================= */

function normalize12(
  values
){

  if(
    !values
    ||
    typeof values.length !== "number"
    ||
    values.length !== 12
  ){

    return null;

  }


  const normalized =
    Array.from(values)
      .map(
        value => {

          const n =
            Number(value);

          return Number.isFinite(n)
            ?
            Math.max(0,n)
            :
            0;

        }
      );


  const max =
    Math.max(
      ...normalized
    );


  if(
    max <= 0
  ){

    return new Array(12)
      .fill(0);

  }


  return normalized.map(
    value =>
      value / max
  );

}


/* =========================================
   NORMALIZAR CHROMA
========================================= */

function normalizeChroma(
  chroma
){

  return normalize12(
    chroma
  );

}


/* =========================================
   GOERTZEL

   Mede a energia de uma frequência
   específica dentro de um frame.

   Útil para procurar notas graves
   sem precisar de uma FFT separada.
========================================= */

function goertzelPower(
  samples,
  sampleRate,
  frequency
){

  if(
    !samples
    ||
    samples.length === 0
    ||
    !Number.isFinite(sampleRate)
    ||
    sampleRate <= 0
    ||
    !Number.isFinite(frequency)
    ||
    frequency <= 0
  ){

    return 0;

  }


  const omega =
    2
    *
    Math.PI
    *
    frequency
    /
    sampleRate;


  const coefficient =
    2
    *
    Math.cos(
      omega
    );


  let s0 = 0;
  let s1 = 0;
  let s2 = 0;


  /*
    Janela Hann simples.

    Reduz leakage espectral.
  */

  const length =
    samples.length;


  for(
    let i = 0;
    i < length;
    i++
  ){

    const hann =
      0.5
      -
      0.5
      *
      Math.cos(
        2
        *
        Math.PI
        *
        i
        /
        Math.max(
          1,
          length - 1
        )
      );


    const value =
      samples[i]
      *
      hann;


    s0 =
      value
      +
      coefficient
      *
      s1
      -
      s2;


    s2 = s1;
    s1 = s0;

  }


  const power =
    s1 * s1
    +
    s2 * s2
    -
    coefficient
    *
    s1
    *
    s2;


  return Math.max(
    0,
    power
  );

}


/* =========================================
   BASS CHROMA

   Mede cada pitch class em várias
   oitavas graves.

   Região aproximada:
   32 Hz → 250 Hz
========================================= */

export function extractBassChroma(
  samples,
  sampleRate
){

  if(
    !samples
    ||
    samples.length === 0
  ){

    return new Array(12)
      .fill(0);

  }


  const result =
    new Array(12)
      .fill(0);


  /*
    Pesos por oitava.

    O grave real recebe maior peso.
  */

  const octaveWeights = [
    1.00,
    0.72,
    0.38
  ];


  for(
    let pitch = 0;
    pitch < 12;
    pitch++
  ){

    const base =
      BASS_BASE_FREQUENCIES[
        pitch
      ];


    let energy = 0;


    for(
      let octave = 0;
      octave < octaveWeights.length;
      octave++
    ){

      const frequency =
        base
        *
        Math.pow(
          2,
          octave
        );


      /*
        Ignoramos frequências
        acima da nossa região de baixo.
      */

      if(
        frequency > 260
      ){

        continue;

      }


      const power =
        goertzelPower(
          samples,
          sampleRate,
          frequency
        );


      /*
        log reduz diferenças gigantes
        entre amplitudes.
      */

      const compressed =
        Math.log1p(
          power
        );


      energy +=
        compressed
        *
        octaveWeights[
          octave
        ];

    }


    result[pitch] =
      energy;

  }


  return (
    normalize12(result)
    ||
    new Array(12)
      .fill(0)
  );

}


/* =========================================
   BASS CHROMA -> NOTA
========================================= */

export function bassChromaToNote(
  bassChroma,
  options = {}
){

  const normalized =
    normalize12(
      bassChroma
    );


  if(!normalized)
    return null;


  const ranked =
    normalized
      .map(
        (energy,index) => ({

          index,

          energy

        })
      )
      .sort(
        (a,b) =>
          b.energy
          -
          a.energy
      );


  if(
    ranked.length === 0
  ){

    return null;

  }


  const first =
    ranked[0];


  const second =
    ranked[1]
    ||
    {
      energy:0
    };


  const minEnergy =
    Number.isFinite(
      Number(
        options.minEnergy
      )
    )
    ?
    Number(
      options.minEnergy
    )
    :
    0.42;


  const minimumMargin =
    Number.isFinite(
      Number(
        options.minimumMargin
      )
    )
    ?
    Number(
      options.minimumMargin
    )
    :
    0.07;


  /*
    Não inventamos baixo quando
    o sinal não está claro.
  */

  if(
    first.energy <
    minEnergy
  ){

    return null;

  }


  if(
    (
      first.energy
      -
      second.energy
    )
    <
    minimumMargin
  ){

    return null;

  }


  return NOTE_NAMES[
    first.index
  ];

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


  const threshold =
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
          b.energy
          -
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
      item =>
        item.energy >=
        minimumEnergy
        &&
        item.energy >=
        strongest * threshold
    );


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


  if(
    candidates.length < 2
  ){

    return [];

  }


  return candidates
    .sort(
      (a,b) =>
        a.index
        -
        b.index
    )
    .map(
      item =>
        item.note
    );

}


/* =========================================
   ANALISAR FRAME
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


  const bassChroma =
    extractBassChroma(
      samples,
      rate
    );


  const bassNote =
    bassChromaToNote(
      bassChroma
    );


  return {

    valid:true,

    chroma,

    bassChroma,

    bassNote,

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
   MEDIANA DE VETORES 12-D
========================================= */

function medianVector12(
  frames
){

  if(
    !Array.isArray(frames)
    ||
    frames.length === 0
  ){

    return null;

  }


  const valid =
    frames
      .map(
        normalize12
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
          vector =>
            vector[pitch]
        )
      );

  }


  return normalize12(
    result
  );

}


/* =========================================
   MEDIANA DE CHROMA
========================================= */

export function medianChroma(
  frames
){

  return medianVector12(
    frames
  );

}


/* =========================================
   MÉDIA DE CHROMA
========================================= */

export function averageChroma(
  frames
){

  if(
    !Array.isArray(frames)
    ||
    frames.length === 0
  ){

    return null;

  }


  const result =
    new Array(12)
      .fill(0);


  let count = 0;


  for(
    const frame
    of frames
  ){

    const vector =
      normalize12(
        frame
      );


    if(!vector)
      continue;


    for(
      let i = 0;
      i < 12;
      i++
    ){

      result[i] +=
        vector[i];

    }


    count++;

  }


  if(
    count === 0
  ){

    return null;

  }


  return normalize12(

    result.map(
      value =>
        value / count
    )

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
    !Array.isArray(channelData)
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
    const samples
    of channelData
  ){

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
   LIMIAR DE SILÊNCIO
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


  const lowIndex =
    Math.floor(
      values.length * 0.10
    );


  const lowLevel =
    values[
      Math.min(
        lowIndex,
        values.length - 1
      )
    ];


  const relativeFloor =
    maxRms * 0.08;


  return Math.max(
    0.0003,

    Math.min(
      lowLevel * 1.35,
      relativeFloor
    )
  );

}


/* =========================================
   AGREGAÇÃO TEMPORAL

   Full chroma + bass chroma são
   suavizados independentemente.
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
    "[Audio Engine v3] RMS floor:",
    rmsFloor
  );


  const duration =
    rawFrames[
      rawFrames.length - 1
    ].time;


  const output = [];


  for(
    let time = 0;
    time <= duration;
    time += hopSeconds
  ){

    const end =
      time
      +
      windowSeconds;


    const members =
      rawFrames.filter(
        frame =>
          frame.time >= time
          &&
          frame.time < end
          &&
          frame.rms >= rmsFloor
      );


    if(
      members.length === 0
    ){

      output.push({

        time,

        chroma:null,

        bassChroma:null,

        bassNote:null,

        notes:[],

        rms:0,

        silence:true,

        sourceFrames:0

      });


      continue;

    }


    const chroma =
      medianVector12(

        members.map(
          frame =>
            frame.chroma
        )

      );


    const bassChroma =
      medianVector12(

        members.map(
          frame =>
            frame.bassChroma
        )

      );


    const bassNote =
      bassChromaToNote(
        bassChroma,
        {

          minEnergy:
            0.40,

          minimumMargin:
            0.06

        }
      );


    const notes =
      chroma
      ?
      chromaToNotes(
        chroma,
        {

          threshold:
            options.threshold
            ??
            0.62,

          maxNotes:
            options.maxNotes
            ??
            5

        }
      )
      :
      [];


    const rms =
      median(
        members.map(
          frame =>
            frame.rms
        )
      );


    output.push({

      time,

      chroma,

      bassChroma,

      bassNote,

      notes,

      rms,

      silence:false,

      sourceFrames:
        members.length

    });


    if(
      output.length <= 12
    ){

      console.log(
        "[Audio Engine v3]",
        time.toFixed(2),
        "bass:",
        bassNote,
        "notes:",
        notes.join(",")
      );

    }

  }


  return output;

}


/* =========================================
   PERSISTÊNCIA DO BAIXO

   Evita:
   A → G# → A → A#

   por um único frame ruidoso.
========================================= */

function stabilizeBassNotes(
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


      const counts = {};


      for(
        let i = start;
        i <= end;
        i++
      ){

        const note =
          frames[i]
          &&
          frames[i].bassNote;


        if(!note)
          continue;


        counts[note] =
          (
            counts[note] || 0
          )
          +
          1;

      }


      const entries =
        Object.entries(
          counts
        )
        .sort(
          (a,b) =>
            b[1]
            -
            a[1]
        );


      if(
        entries.length === 0
      ){

        return {
          ...frame,
          bassNote:null
        };

      }


      const [
        bestNote,
        count
      ] =
        entries[0];


      const neighborhood =
        end - start + 1;


      const stable =
        count >=
        Math.ceil(
          neighborhood * 0.5
        );


      return {

        ...frame,

        bassNote:
          stable
          ?
          bestNote
          :
          frame.bassNote

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
        start
        /
        sampleRate,

      chroma:
        analysis.chroma,

      bassChroma:
        analysis.bassChroma,

      bassNote:
        analysis.bassNote,

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
      "Nenhum frame pôde ser analisado"
    );

  }


  /* =====================================
     2. AGREGAÇÃO
  ===================================== */

  let decisionFrames =
    aggregateFrames(
      rawFrames,
      {

        threshold:
          options.threshold
          ??
          0.62,

        maxNotes:
          options.maxNotes
          ??
          5,

        windowSeconds:
          options.windowSeconds
          ??
          0.28,

        decisionHopSeconds:
          options.decisionHopSeconds
          ??
          0.20

      }
    );


  /* =====================================
     3. ESTABILIZAR BAIXO
  ===================================== */

  decisionFrames =
    stabilizeBassNotes(
      decisionFrames,
      1
    );


  /* =====================================
     4. FRAMES FINAIS
  ===================================== */

  const frames =
    decisionFrames.map(
      frame => {

        if(
          frame.silence
        ){

          return {

            ...frame,

            notes:[],

            bassNote:null

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
      frames.length,

    frames

  };

}


/* =========================================
   SUAVIZAÇÃO LEGADA
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


  return frames.map(
    (frame,index) => {

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
        medianVector12(
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
   TESTE INTERNO
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
          .trim()
          .toUpperCase()
      );


    if(
      index >= 0
    ){

      chroma[index] = 1;

    }

  }


  return {

    chroma,

    notes:
      chromaToNotes(
        chroma,
        {

          threshold:0.5,

          maxNotes:6

        }
      )

  };

}
