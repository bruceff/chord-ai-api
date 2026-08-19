import Meyda from "meyda";
import WavDecoder from "wav-decoder";


/* =========================================
   CHORD AI — AUDIO ENGINE v4

   foco:
   - chroma completo
   - bass detector 2.0
   - correção de harmônicos
   - bass confidence
   - persistência temporal
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
   NORMALIZAR VETOR DE 12
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
   NOTA MIDI -> FREQUÊNCIA
========================================= */

function midiToFrequency(
  midi
){

  return (
    440
    *
    Math.pow(
      2,
      (
        midi - 69
      )
      /
      12
    )
  );

}


/* =========================================
   FREQUÊNCIA -> PITCH CLASS
========================================= */

function midiToPitchClass(
  midi
){

  return (
    midi % 12
    +
    12
  ) % 12;

}


/* =========================================
   GOERTZEL
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


    s2 =
      s1;

    s1 =
      s0;

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
   ENERGIA EM TORNO DE UMA FREQUÊNCIA

   Avalia ligeiramente abaixo, centro e
   acima para tolerar afinação/desvio.
========================================= */

function localFrequencyEnergy(
  samples,
  sampleRate,
  frequency
){

  const ratios = [
    0.985,
    1.0,
    1.015
  ];


  let total = 0;


  for(
    const ratio
    of ratios
  ){

    total +=
      Math.log1p(
        goertzelPower(
          samples,
          sampleRate,
          frequency * ratio
        )
      );

  }


  return total
    /
    ratios.length;

}


/* =========================================
   BASS SPECTRUM CROMÁTICO

   MIDI 24 = C1
   MIDI 52 = E3

   cobrimos uma faixa suficientemente
   grave para baixo/fundamental.
========================================= */

function analyzeBassSpectrum(
  samples,
  sampleRate
){

  const bins = [];


  for(
    let midi = 24;
    midi <= 52;
    midi++
  ){

    const frequency =
      midiToFrequency(
        midi
      );


    const energy =
      localFrequencyEnergy(
        samples,
        sampleRate,
        frequency
      );


    bins.push({

      midi,

      frequency,

      pitchClass:
        midiToPitchClass(
          midi
        ),

      energy

    });

  }


  return bins;

}


/* =========================================
   CORREÇÃO DE HARMÔNICOS

   Se uma nota aguda parece forte apenas
   porque é harmônico de uma nota mais
   grave, reduzimos sua força como root.
========================================= */

function applyHarmonicCorrection(
  bins
){

  const corrected =
    bins.map(
      bin => ({
        ...bin,
        correctedEnergy:
          bin.energy
      })
    );


  for(
    let i = 0;
    i < corrected.length;
    i++
  ){

    const current =
      corrected[i];


    /*
      Procura aproximadamente:
      2x frequência = oitava
      3x frequência = quinta/12ª
    */

    for(
      let j = 0;
      j < corrected.length;
      j++
    ){

      if(i === j)
        continue;


      const lower =
        corrected[j];


      if(
        lower.frequency >=
        current.frequency
      ){

        continue;

      }


      const ratio =
        current.frequency
        /
        lower.frequency;


      let penalty = 0;


      if(
        Math.abs(
          ratio - 2
        )
        <
        0.04
      ){

        penalty =
          lower.energy
          *
          0.24;

      }


      else if(
        Math.abs(
          ratio - 3
        )
        <
        0.06
      ){

        penalty =
          lower.energy
          *
          0.12;

      }


      current.correctedEnergy -=
        penalty;

    }


    current.correctedEnergy =
      Math.max(
        0,
        current.correctedEnergy
      );

  }


  return corrected;

}


/* =========================================
   BASS CHROMA v4
========================================= */

export function extractBassChroma(
  samples,
  sampleRate
){

  const bins =
    analyzeBassSpectrum(
      samples,
      sampleRate
    );


  const corrected =
    applyHarmonicCorrection(
      bins
    );


  const chroma =
    new Array(12)
      .fill(0);


  for(
    const bin
    of corrected
  ){

    /*
      Quanto mais grave a oitava,
      maior o peso como possível root.
    */

    const octave =
      Math.floor(
        bin.midi / 12
      )
      -
      1;


    let octaveWeight = 1;


    if(octave <= 1){

      octaveWeight =
        1.00;

    }

    else if(octave === 2){

      octaveWeight =
        0.78;

    }

    else{

      octaveWeight =
        0.48;

    }


    chroma[
      bin.pitchClass
    ] +=
      bin.correctedEnergy
      *
      octaveWeight;

  }


  return (
    normalize12(
      chroma
    )
    ||
    new Array(12)
      .fill(0)
  );

}


/* =========================================
   ANALISAR BASS CHROMA

   retorna:
   bassNote
   bassConfidence
========================================= */

export function analyzeBassChroma(
  bassChroma
){

  const normalized =
    normalize12(
      bassChroma
    );


  if(!normalized){

    return {

      bassNote:null,

      bassConfidence:0,

      bassMargin:0

    };

  }


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
    ranked.length < 2
  ){

    return {

      bassNote:null,

      bassConfidence:0,

      bassMargin:0

    };

  }


  const first =
    ranked[0];


  const second =
    ranked[1];


  const margin =
    first.energy
    -
    second.energy;


  /*
    Confiança:
    - força absoluta
    - margem para segundo colocado
  */

  const absolute =
    clamp(
      (
        first.energy
        -
        0.25
      )
      /
      0.75,
      0,
      1
    );


  const separation =
    clamp(
      margin
      /
      0.22,
      0,
      1
    );


  const confidence =
    absolute * 0.55
    +
    separation * 0.45;


  /*
    Só expomos bassNote quando
    há evidência razoável.
  */

  if(
    first.energy < 0.34
    ||
    margin < 0.035
    ||
    confidence < 0.34
  ){

    return {

      bassNote:null,

      bassConfidence:
        Number(
          confidence
            .toFixed(3)
        ),

      bassMargin:
        Number(
          margin
            .toFixed(3)
        )

    };

  }


  return {

    bassNote:
      NOTE_NAMES[
        first.index
      ],

    bassConfidence:
      Number(
        clamp(
          confidence,
          0,
          0.97
        )
        .toFixed(3)
      ),

    bassMargin:
      Number(
        margin
          .toFixed(3)
      )

  };

}


/* =========================================
   COMPATIBILIDADE
========================================= */

export function bassChromaToNote(
  bassChroma
){

  return analyzeBassChroma(
    bassChroma
  ).bassNote;

}


/* =========================================
   CHROMA -> NOTAS
========================================= */

export function chromaToNotes(
  chroma,
  options = {}
){

  const normalized =
    normalize12(
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


  const strongest =
    ranked[0]
    ?
    ranked[0].energy
    :
    0;


  if(
    strongest <= 0
  ){

    return [];

  }


  let candidates =
    ranked.filter(
      item =>
        item.energy >=
        minimumEnergy
        &&
        item.energy >=
        strongest
        *
        threshold
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
    samples.length === 0
  ){

    return {

      valid:false,

      error:
        "Frame vazio"

    };

  }


  Meyda.sampleRate =
    sampleRate;


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
        "Chroma indisponível"

    };

  }


  const chroma =
    normalize12(
      features.chroma
    );


  const bassChroma =
    extractBassChroma(
      samples,
      sampleRate
    );


  const bass =
    analyzeBassChroma(
      bassChroma
    );


  return {

    valid:true,

    chroma,

    bassChroma,

    bassNote:
      bass.bassNote,

    bassConfidence:
      bass.bassConfidence,

    bassMargin:
      bass.bassMargin,

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
   MEDIANA VETOR 12
========================================= */

function medianVector12(
  vectors
){

  if(
    !Array.isArray(vectors)
    ||
    vectors.length === 0
  ){

    return null;

  }


  const valid =
    vectors
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
   MEDIAN CHROMA
========================================= */

export function medianChroma(
  frames
){

  return medianVector12(
    frames
  );

}


/* =========================================
   AVERAGE CHROMA
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
   MONO
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
    const channel
    of channelData
  ){

    for(
      let i = 0;
      i < length;
      i++
    ){

      mono[i] +=
        channel[i]
        /
        channelData.length;

    }

  }


  return mono;

}


/* =========================================
   RMS FLOOR
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


  return Math.max(
    0.0003,

    Math.min(
      lowLevel * 1.35,
      maxRms * 0.08
    )
  );

}


/* =========================================
   AGREGAÇÃO TEMPORAL
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
      1
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

        bassConfidence:0,

        notes:[],

        rms:0,

        silence:true

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


    const bass =
      analyzeBassChroma(
        bassChroma
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


    output.push({

      time,

      chroma,

      bassChroma,

      bassNote:
        bass.bassNote,

      bassConfidence:
        bass.bassConfidence,

      bassMargin:
        bass.bassMargin,

      notes,

      rms,

      silence:false,

      sourceFrames:
        members.length

    });

  }


  return output;

}


/* =========================================
   ESTABILIZAR BAIXO
========================================= */

function stabilizeBass(
  frames
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
          index - 1
        );


      const end =
        Math.min(
          frames.length - 1,
          index + 1
        );


      const weighted = {};


      for(
        let i = start;
        i <= end;
        i++
      ){

        const neighbor =
          frames[i];


        if(
          !neighbor
          ||
          !neighbor.bassNote
        ){

          continue;

        }


        const weight =
          Number(
            neighbor.bassConfidence
            ||
            0
          );


        weighted[
          neighbor.bassNote
        ] =
          (
            weighted[
              neighbor.bassNote
            ]
            ||
            0
          )
          +
          weight;

      }


      const ranking =
        Object.entries(
          weighted
        )
        .sort(
          (a,b) =>
            b[1]
            -
            a[1]
        );


      if(
        ranking.length === 0
      ){

        return {
          ...frame
        };

      }


      const [
        note,
        score
      ] =
        ranking[0];


      if(
        score < 0.55
      ){

        return {
          ...frame
        };

      }


      return {

        ...frame,

        bassNote:
          note,

        bassConfidence:
          clamp(
            Math.max(
              frame.bassConfidence || 0,
              score / 3
            ),
            0,
            0.97
          )

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


  /*
    Para detecção grave, 8192 dá
    resolução melhor que 4096.

    Mantemos configurável.
  */

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
    8192;


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

      bassConfidence:
        analysis.bassConfidence,

      bassMargin:
        analysis.bassMargin,

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
          0.32,

        decisionHopSeconds:
          options.decisionHopSeconds
          ??
          0.20

      }
    );


  decisionFrames =
    stabilizeBass(
      decisionFrames
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
      decisionFrames.length,

    frames:
      decisionFrames

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
   TESTE
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
          threshold:0.5,
          maxNotes:6
        }
      )

  };

}
