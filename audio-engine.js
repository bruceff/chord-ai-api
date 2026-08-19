import Meyda from "meyda";
import WavDecoder from "wav-decoder";


/* =========================================
   CHORD AI — AUDIO ENGINE v5

   OBJETIVO:

   WAV
    ↓
   PCM MONO
    ↓
   CHROMA COMPLETO
    +
   BASS NOTE DETECTOR v3
    ↓
   nota grave real:
   D3 / G3 / A3 / B2...
    ↓
   pitch class:
   D / G / A / B
    ↓
   Chord Engine

   Melhorias:

   - busca grave ampliada até B3
   - não soma oitavas prematuramente
   - detecta primeiro altura real
   - usa pico espectral local
   - usa suporte harmônico
   - prefere o menor pico forte real
   - bassConfidence real
   - agregação temporal do baixo
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
   CONFIGURAÇÃO DO BASS DETECTOR
========================================= */

/*
   MIDI:

   36 = C2
   47 = B2
   48 = C3
   50 = D3
   52 = E3
   53 = F3
   55 = G3
   57 = A3
   59 = B3

   IMPORTANTE:

   O detector anterior terminava
   aproximadamente em E3.

   Agora cobrimos até B3.
*/

const BASS_MIN_MIDI = 36;

const BASS_MAX_MIDI = 59;


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
    )
    /
    2;

  }


  return sorted[middle];

}


/* =========================================
   NORMALIZAR VETOR
========================================= */

function normalizeVector(
  values
){

  if(
    !values
    ||
    typeof values.length !== "number"
    ||
    values.length === 0
  ){

    return null;

  }


  const array =
    Array.from(values)
      .map(
        value => {

          const n =
            Number(value);


          if(
            !Number.isFinite(n)
          ){

            return 0;

          }


          return Math.max(
            0,
            n
          );

        }
      );


  const max =
    Math.max(
      ...array
    );


  if(
    max <= 0
  ){

    return new Array(
      array.length
    )
    .fill(0);

  }


  return array.map(
    value =>
      value / max
  );

}


/* =========================================
   NORMALIZAR 12
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


  return normalizeVector(
    values
  );

}


/* =========================================
   MIDI -> FREQUÊNCIA
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
   MIDI -> PITCH CLASS
========================================= */

function midiToPitchClass(
  midi
){

  return (
    midi % 12
    +
    12
  )
  %
  12;

}


/* =========================================
   MIDI -> NOME COMPLETO

   Ex:
   50 -> D3
========================================= */

function midiToFullNoteName(
  midi
){

  const pitchClass =
    midiToPitchClass(
      midi
    );


  const octave =
    Math.floor(
      midi / 12
    )
    -
    1;


  return (
    NOTE_NAMES[
      pitchClass
    ]
    +
    octave
  );

}


/* =========================================
   GOERTZEL

   Mede energia próxima de uma
   frequência específica.
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

    /*
      Hann window.

      Reduz vazamento espectral
      entre notas vizinhas.
    */

    const window =
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
      window;


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
   ENERGIA LOCAL

   Não analisamos apenas a frequência
   matemática perfeita.

   Isso tolera:
   - afinação
   - instrumentos reais
   - pequenas diferenças de pitch
========================================= */

function localFrequencyEnergy(
  samples,
  sampleRate,
  frequency
){

  const ratios = [

    0.988,

    0.994,

    1.000,

    1.006,

    1.012

  ];


  let total = 0;


  for(
    const ratio
    of ratios
  ){

    const power =
      goertzelPower(
        samples,
        sampleRate,
        frequency * ratio
      );


    /*
      Compressão logarítmica.

      Evita que um único pico
      gigantesco domine tudo.
    */

    total +=
      Math.log1p(
        power
      );

  }


  return total
    /
    ratios.length;

}


/* =========================================
   PERFIL GRAVE BRUTO

   Aqui ainda NÃO reduzimos para
   pitch classes.

   Teremos:

   C2
   C#2
   D2
   ...
   B2
   C3
   ...
   B3
========================================= */

function extractBassProfile(
  samples,
  sampleRate
){

  const raw = [];


  for(
    let midi = BASS_MIN_MIDI;
    midi <= BASS_MAX_MIDI;
    midi++
  ){

    const frequency =
      midiToFrequency(
        midi
      );


    const directEnergy =
      localFrequencyEnergy(
        samples,
        sampleRate,
        frequency
      );


    raw.push({

      midi,

      frequency,

      pitchClass:
        midiToPitchClass(
          midi
        ),

      fullNote:
        midiToFullNoteName(
          midi
        ),

      directEnergy

    });

  }


  const normalized =
    normalizeVector(

      raw.map(
        item =>
          item.directEnergy
      )

    );


  for(
    let i = 0;
    i < raw.length;
    i++
  ){

    raw[i].directNormalized =
      normalized
      ?
      normalized[i]
      :
      0;

  }


  return raw;

}


/* =========================================
   SUPORTE HARMÔNICO

   Uma fundamental real pode ser
   apoiada por:

   f
   2f
   3f

   Mas os harmônicos NÃO podem
   substituir a fundamental.
========================================= */

function calculateHarmonicSupport(
  samples,
  sampleRate,
  frequency
){

  const second =
    frequency * 2;


  const third =
    frequency * 3;


  let support = 0;


  if(
    second <
    sampleRate / 2
  ){

    support +=
      localFrequencyEnergy(
        samples,
        sampleRate,
        second
      )
      *
      0.13;

  }


  if(
    third <
    sampleRate / 2
  ){

    support +=
      localFrequencyEnergy(
        samples,
        sampleRate,
        third
      )
      *
      0.055;

  }


  return support;

}


/* =========================================
   FINALIZAR PERFIL GRAVE
========================================= */

function scoreBassProfile(
  profile,
  samples,
  sampleRate
){

  if(
    !Array.isArray(profile)
    ||
    profile.length === 0
  ){

    return [];

  }


  const output =
    profile.map(
      item => ({
        ...item
      })
    );


  /*
    Primeiro calculamos suporte
    harmônico bruto.
  */

  const harmonicRaw =
    output.map(
      item =>
        calculateHarmonicSupport(
          samples,
          sampleRate,
          item.frequency
        )
    );


  const harmonicNormalized =
    normalizeVector(
      harmonicRaw
    );


  for(
    let i = 0;
    i < output.length;
    i++
  ){

    const current =
      output[i];


    const left =
      i > 0
      ?
      output[i - 1]
        .directNormalized
      :
      0;


    const right =
      i <
      output.length - 1
      ?
      output[i + 1]
        .directNormalized
      :
      0;


    /*
      Um pico real deve ser maior
      que notas cromáticas vizinhas.
    */

    const neighborMax =
      Math.max(
        left,
        right
      );


    const localDominance =
      clamp(
        current.directNormalized
        -
        neighborMax
        +
        0.5,
        0,
        1
      );


    /*
      Suporte harmônico ajuda,
      mas jamais domina o direto.
    */

    const harmonic =
      harmonicNormalized
      ?
      harmonicNormalized[i]
      :
      0;


    /*
      Pequeno viés para frequências
      mais graves.

      Isso ajuda a encontrar o
      baixo verdadeiro em um acorde.
    */

    const lowBias =
      1
      -
      (
        (
          current.midi
          -
          BASS_MIN_MIDI
        )
        /
        Math.max(
          1,
          BASS_MAX_MIDI
          -
          BASS_MIN_MIDI
        )
      );


    current.harmonicSupport =
      harmonic;


    current.localDominance =
      localDominance;


    current.rootScore =
      current.directNormalized
      *
      0.74
      +
      harmonic
      *
      0.11
      +
      localDominance
      *
      0.10
      +
      lowBias
      *
      0.05;

  }


  return output;

}


/* =========================================
   ESCOLHER FUNDAMENTAL GRAVE

   Estratégia principal:

   entre os picos realmente fortes,
   preferimos o MAIS GRAVE.

   Isso é muito diferente de somar
   todas as oitavas por pitch class.
========================================= */

function selectBassCandidate(
  profile
){

  if(
    !Array.isArray(profile)
    ||
    profile.length === 0
  ){

    return {

      bassNote:null,

      bassFullNote:null,

      bassMidi:null,

      bassConfidence:0

    };

  }


  /*
    Primeiro encontramos o máximo
    de energia direta.
  */

  const maxDirect =
    Math.max(
      ...profile.map(
        item =>
          item.directNormalized
      )
    );


  if(
    maxDirect <= 0
  ){

    return {

      bassNote:null,

      bassFullNote:null,

      bassMidi:null,

      bassConfidence:0

    };

  }


  /*
    Picos locais fortes.

    O threshold é relativo ao
    próprio frame.
  */

  let strong =
    profile.filter(
      (item,index) => {

        const left =
          index > 0
          ?
          profile[index - 1]
            .directNormalized
          :
          0;


        const right =
          index <
          profile.length - 1
          ?
          profile[index + 1]
            .directNormalized
          :
          0;


        const isLocalPeak =
          item.directNormalized >=
          left
          &&
          item.directNormalized >=
          right;


        const strongEnough =
          item.directNormalized >=
          0.48;


        return (
          isLocalPeak
          &&
          strongEnough
        );

      }
    );


  /*
    Se não achamos nenhum pico
    acima de 0.48, relaxamos.
  */

  if(
    strong.length === 0
  ){

    strong =
      profile.filter(
        (item,index) => {

          const left =
            index > 0
            ?
            profile[index - 1]
              .directNormalized
            :
            0;


          const right =
            index <
            profile.length - 1
            ?
            profile[index + 1]
              .directNormalized
            :
            0;


          return (
            item.directNormalized >=
            0.36
            &&
            item.directNormalized >=
            left
            &&
            item.directNormalized >=
            right
          );

        }
      );

  }


  /*
    Caso ainda não haja candidato,
    usa maior rootScore.
  */

  let selected;


  if(
    strong.length > 0
  ){

    /*
      Regra central:

      o menor MIDI forte ganha.

      Porém ignoramos um pico grave
      se ele for extremamente mais
      fraco que os demais.
    */

    const highestStrongDirect =
      Math.max(
        ...strong.map(
          item =>
            item.directNormalized
        )
      );


    const trustworthy =
      strong.filter(
        item =>
          item.directNormalized >=
          highestStrongDirect
          *
          0.62
      );


    trustworthy.sort(
      (a,b) =>
        a.midi - b.midi
    );


    selected =
      trustworthy[0];

  }

  else{

    selected =
      [...profile]
        .sort(
          (a,b) =>
            b.rootScore
            -
            a.rootScore
        )[0];

  }


  if(!selected){

    return {

      bassNote:null,

      bassFullNote:null,

      bassMidi:null,

      bassConfidence:0

    };

  }


  /*
    Quanto de energia forte existe
    ABAIXO da nota selecionada?

    Se praticamente não existe,
    temos boa evidência de que ela
    é realmente a nota mais grave.
  */

  const lowerBins =
    profile.filter(
      item =>
        item.midi <
        selected.midi
    );


  const strongestBelow =
    lowerBins.length
    ?
    Math.max(
      ...lowerBins.map(
        item =>
          item.directNormalized
      )
    )
    :
    0;


  const lowerSeparation =
    clamp(
      (
        selected.directNormalized
        -
        strongestBelow
      )
      /
      0.45,
      0,
      1
    );


  const directConfidence =
    clamp(
      (
        selected.directNormalized
        -
        0.30
      )
      /
      0.70,
      0,
      1
    );


  const localConfidence =
    clamp(
      selected.localDominance,
      0,
      1
    );


  let confidence =
    directConfidence
    *
    0.48
    +
    lowerSeparation
    *
    0.36
    +
    localConfidence
    *
    0.16;


  confidence =
    clamp(
      confidence,
      0,
      0.98
    );


  /*
    Não retornamos null facilmente.

    O Chord Engine já foi construído
    para tratar baixo como evidência,
    não verdade absoluta.
  */

  if(
    selected.directNormalized <
    0.30
    ||
    confidence <
    0.25
  ){

    return {

      bassNote:null,

      bassFullNote:null,

      bassMidi:null,

      bassConfidence:
        Number(
          confidence.toFixed(3)
        )

    };

  }


  return {

    bassNote:
      NOTE_NAMES[
        selected.pitchClass
      ],

    bassFullNote:
      selected.fullNote,

    bassMidi:
      selected.midi,

    bassConfidence:
      Number(
        confidence.toFixed(3)
      ),

    directEnergy:
      Number(
        selected
          .directNormalized
          .toFixed(3)
      ),

    rootScore:
      Number(
        selected
          .rootScore
          .toFixed(3)
      )

  };

}


/* =========================================
   PERFIL -> BASS CHROMA

   Agora só transformamos em pitch
   class DEPOIS de analisar alturas.
========================================= */

function bassProfileToChroma(
  profile
){

  const chroma =
    new Array(12)
      .fill(0);


  if(
    !Array.isArray(profile)
  ){

    return chroma;

  }


  for(
    const item
    of profile
  ){

    /*
      Usamos rootScore.

      Frequências mais altas não
      recebem soma exagerada.
    */

    let octaveWeight = 1;


    if(
      item.midi >= 48
      &&
      item.midi <= 59
    ){

      octaveWeight =
        0.78;

    }


    if(
      item.midi < 48
    ){

      octaveWeight =
        1.00;

    }


    chroma[
      item.pitchClass
    ] +=
      item.rootScore
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
   ANALISAR BAIXO COMPLETO
========================================= */

function analyzeBassFrame(
  samples,
  sampleRate
){

  const rawProfile =
    extractBassProfile(
      samples,
      sampleRate
    );


  const scoredProfile =
    scoreBassProfile(
      rawProfile,
      samples,
      sampleRate
    );


  const selected =
    selectBassCandidate(
      scoredProfile
    );


  const bassChroma =
    bassProfileToChroma(
      scoredProfile
    );


  return {

    bassChroma,

    bassProfile:
      scoredProfile.map(
        item =>
          item.rootScore
      ),

    bassNote:
      selected.bassNote,

    bassFullNote:
      selected.bassFullNote,

    bassMidi:
      selected.bassMidi,

    bassConfidence:
      selected.bassConfidence,

    bassDirectEnergy:
      selected.directEnergy
      ??
      0,

    bassRootScore:
      selected.rootScore
      ??
      0

  };

}


/* =========================================
   COMPATIBILIDADE:
   EXTRACT BASS CHROMA
========================================= */

export function extractBassChroma(
  samples,
  sampleRate
){

  return analyzeBassFrame(
    samples,
    sampleRate
  ).bassChroma;

}


/* =========================================
   ANALISAR BASS CHROMA

   Fallback quando só temos
   o vetor de pitch classes.
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


  const first =
    ranked[0];


  const second =
    ranked[1]
    ||
    {
      energy:0
    };


  if(!first){

    return {

      bassNote:null,

      bassConfidence:0,

      bassMargin:0

    };

  }


  const margin =
    first.energy
    -
    second.energy;


  const confidence =
    clamp(
      (
        first.energy * 0.60
      )
      +
      (
        clamp(
          margin / 0.25,
          0,
          1
        )
        *
        0.40
      ),
      0,
      0.95
    );


  if(
    first.energy < 0.30
  ){

    return {

      bassNote:null,

      bassConfidence:
        Number(
          confidence.toFixed(3)
        ),

      bassMargin:
        Number(
          margin.toFixed(3)
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
        confidence.toFixed(3)
      ),

    bassMargin:
      Number(
        margin.toFixed(3)
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


  if(
    ranked.length === 0
  ){

    return [];

  }


  const strongest =
    ranked[0].energy;


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
   ANALISAR FRAME DE ÁUDIO
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
        "Frame vazio"

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
        "Chroma indisponível"

    };

  }


  const chroma =
    normalize12(
      features.chroma
    );


  const bass =
    analyzeBassFrame(
      samples,
      rate
    );


  return {

    valid:true,

    chroma,

    bassChroma:
      bass.bassChroma,

    bassProfile:
      bass.bassProfile,

    bassNote:
      bass.bassNote,

    bassFullNote:
      bass.bassFullNote,

    bassMidi:
      bass.bassMidi,

    bassConfidence:
      bass.bassConfidence,

    bassDirectEnergy:
      bass.bassDirectEnergy,

    bassRootScore:
      bass.bassRootScore,

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
   MEDIANA DE VETORES
========================================= */

function medianVector(
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
      .filter(
        vector =>
          vector
          &&
          typeof vector.length ===
          "number"
      );


  if(
    valid.length === 0
  ){

    return null;

  }


  const length =
    valid[0].length;


  const result =
    new Array(length)
      .fill(0);


  for(
    let index = 0;
    index < length;
    index++
  ){

    result[index] =
      median(
        valid.map(
          vector =>
            Number(
              vector[index]
              ||
              0
            )
        )
      );

  }


  return normalizeVector(
    result
  );

}


/* =========================================
   MEDIANA 12
========================================= */

function medianVector12(
  vectors
){

  const result =
    medianVector(
      vectors
    );


  if(
    !result
    ||
    result.length !== 12
  ){

    return null;

  }


  return result;

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


  if(
    maxRms <= 0
  ){

    return 0.0005;

  }


  const lowIndex =
    Math.floor(
      values.length
      *
      0.10
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
   ANALISAR PERFIL AGREGADO
========================================= */

function analyzeAggregatedBassProfile(
  profile
){

  if(
    !profile
    ||
    profile.length !==
    (
      BASS_MAX_MIDI
      -
      BASS_MIN_MIDI
      +
      1
    )
  ){

    return {

      bassNote:null,

      bassFullNote:null,

      bassMidi:null,

      bassConfidence:0

    };

  }


  const normalized =
    normalizeVector(
      profile
    );


  if(!normalized){

    return {

      bassNote:null,

      bassFullNote:null,

      bassMidi:null,

      bassConfidence:0

    };

  }


  const candidates =
    normalized.map(
      (score,index) => {

        const midi =
          BASS_MIN_MIDI
          +
          index;


        const left =
          index > 0
          ?
          normalized[
            index - 1
          ]
          :
          0;


        const right =
          index <
          normalized.length - 1
          ?
          normalized[
            index + 1
          ]
          :
          0;


        return {

          midi,

          pitchClass:
            midiToPitchClass(
              midi
            ),

          fullNote:
            midiToFullNoteName(
              midi
            ),

          score,

          localPeak:
            score >= left
            &&
            score >= right

        };

      }
    );


  let strong =
    candidates.filter(
      item =>
        item.localPeak
        &&
        item.score >=
        0.48
    );


  if(
    strong.length === 0
  ){

    strong =
      candidates.filter(
        item =>
          item.localPeak
          &&
          item.score >=
          0.35
      );

  }


  let selected;


  if(
    strong.length > 0
  ){

    const strongest =
      Math.max(
        ...strong.map(
          item =>
            item.score
        )
      );


    const reliable =
      strong.filter(
        item =>
          item.score >=
          strongest
          *
          0.62
      );


    reliable.sort(
      (a,b) =>
        a.midi
        -
        b.midi
    );


    selected =
      reliable[0];

  }

  else{

    selected =
      [...candidates]
        .sort(
          (a,b) =>
            b.score
            -
            a.score
        )[0];

  }


  if(!selected){

    return {

      bassNote:null,

      bassFullNote:null,

      bassMidi:null,

      bassConfidence:0

    };

  }


  const lower =
    candidates.filter(
      item =>
        item.midi <
        selected.midi
    );


  const lowerMax =
    lower.length
    ?
    Math.max(
      ...lower.map(
        item =>
          item.score
      )
    )
    :
    0;


  const separation =
    clamp(
      (
        selected.score
        -
        lowerMax
      )
      /
      0.40,
      0,
      1
    );


  const confidence =
    clamp(
      selected.score
      *
      0.62
      +
      separation
      *
      0.38,
      0,
      0.98
    );


  return {

    bassNote:
      NOTE_NAMES[
        selected.pitchClass
      ],

    bassFullNote:
      selected.fullNote,

    bassMidi:
      selected.midi,

    bassConfidence:
      Number(
        confidence.toFixed(3)
      )

  };

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
      1.0
    )
    :
    0.30;


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
    "[Audio Engine v5] RMS floor:",
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

        bassFullNote:null,

        bassConfidence:0,

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


    /*
      Muito importante:

      agregamos o perfil com OITAVA,
      não apenas o bassChroma.
    */

    const bassProfile =
      medianVector(

        members.map(
          frame =>
            frame.bassProfile
        )

      );


    const bass =
      analyzeAggregatedBassProfile(
        bassProfile
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

      bassProfile,

      bassNote:
        bass.bassNote,

      bassFullNote:
        bass.bassFullNote,

      bassMidi:
        bass.bassMidi,

      bassConfidence:
        bass.bassConfidence,

      notes,

      rms,

      silence:false,

      sourceFrames:
        members.length

    });


    if(
      output.length <= 20
    ){

      console.log(

        "[Audio Engine v5]",

        time.toFixed(2),

        "| bass:",

        bass.bassFullNote,

        "| class:",

        bass.bassNote,

        "| confidence:",

        bass.bassConfidence,

        "| notes:",

        notes.join(",")

      );

    }

  }


  return output;

}


/* =========================================
   ESTABILIZAÇÃO TEMPORAL DO BAIXO
========================================= */

function stabilizeBass(
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


      const scores = {};


      const info = {};


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
          !neighbor.bassFullNote
        ){

          continue;

        }


        const confidence =
          Number(
            neighbor.bassConfidence
            ||
            0
          );


        scores[
          neighbor.bassFullNote
        ] =
          (
            scores[
              neighbor.bassFullNote
            ]
            ||
            0
          )
          +
          confidence;


        info[
          neighbor.bassFullNote
        ] =
          neighbor;

      }


      const ranking =
        Object.entries(
          scores
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
        fullNote,
        totalScore
      ] =
        ranking[0];


      const source =
        info[
          fullNote
        ];


      if(
        !source
        ||
        totalScore < 0.48
      ){

        return {
          ...frame
        };

      }


      return {

        ...frame,

        bassNote:
          source.bassNote,

        bassFullNote:
          source.bassFullNote,

        bassMidi:
          source.bassMidi,

        bassConfidence:
          clamp(
            Math.max(
              Number(
                frame.bassConfidence
                ||
                0
              ),
              totalScore
              /
              (
                end - start + 1
              )
            ),
            0,
            0.98
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
    Mantemos compatibilidade com
    o server atual.

    Se server envia 4096,
    usamos 4096.

    Depois podemos testar 8192
    separadamente.
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

      bassProfile:
        analysis.bassProfile,

      bassNote:
        analysis.bassNote,

      bassFullNote:
        analysis.bassFullNote,

      bassMidi:
        analysis.bassMidi,

      bassConfidence:
        analysis.bassConfidence,

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
          0.30,

        decisionHopSeconds:
          options.decisionHopSeconds
          ??
          0.20

      }
    );


  decisionFrames =
    stabilizeBass(
      decisionFrames,
      1
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
   TESTE INTERNO DE CHROMA
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
