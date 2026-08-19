import {
  analyzeChord,
  detectChordCandidatesFromChroma
} from "./chord-engine.js";


/* =========================================
   CHORD AI
   RECONSTRUCTION VALIDATOR v2

   Objetivos:

   1. validar a hipótese do Chord Engine
      usando a região inteira;

   2. resgatar candidatos plausíveis que
      ficaram fora do top inicial;

   3. exigir ganho acústico real para
      extensões (7, maj7, 6, 9...);

   4. identificar frames de fronteira sem
      simplesmente apagar acordes curtos;

   5. nunca usar regras específicas para
      um acorde ou benchmark.
========================================= */


const NOTES = [
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


const ENHARMONIC = {

  DB:"C#",
  EB:"D#",
  GB:"F#",
  AB:"G#",
  BB:"A#",

  CB:"B",
  FB:"E",

  "E#":"F",
  "B#":"C"

};


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


function normalizeNote(
  note
){

  if(!note)
    return null;


  let value =
    String(note)
      .trim()
      .toUpperCase()
      .replace("♯","#")
      .replace("♭","B");


  if(
    ENHARMONIC[value]
  ){

    value =
      ENHARMONIC[value];

  }


  return NOTES.includes(value)
    ?
    value
    :
    null;

}


function noteIndex(
  note
){

  const normalized =
    normalizeNote(
      note
    );


  return normalized
    ?
    NOTES.indexOf(
      normalized
    )
    :
    -1;

}


function normalize12(
  vector
){

  if(
    !vector
    ||
    typeof vector.length !== "number"
    ||
    vector.length !== 12
  ){

    return null;

  }


  const values =
    Array.from(vector)
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
      ...values
    );


  if(max <= 0){

    return new Array(12)
      .fill(0);

  }


  return values.map(
    value =>
      value / max
  );

}


function median(
  values
){

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
    sorted.length % 2
  ){

    return sorted[middle];

  }


  return (
    sorted[middle - 1]
    +
    sorted[middle]
  ) / 2;

}


/* =========================================
   CHROMA REGIONAL
========================================= */

function medianChroma(
  frames
){

  if(
    !Array.isArray(frames)
    ||
    frames.length === 0
  ){

    return null;

  }


  const vectors =
    frames
      .map(
        frame =>
          normalize12(
            frame.chroma
          )
      )
      .filter(Boolean);


  if(
    vectors.length === 0
  ){

    return null;

  }


  const output =
    new Array(12)
      .fill(0);


  for(
    let pitch = 0;
    pitch < 12;
    pitch++
  ){

    output[pitch] =
      median(
        vectors.map(
          vector =>
            vector[pitch]
        )
      );

  }


  return normalize12(
    output
  );

}


/* =========================================
   BAIXO REGIONAL
========================================= */

function dominantBass(
  frames
){

  const counts =
    new Map();


  let totalWeight = 0;


  for(
    const frame
    of frames
  ){

    const note =
      normalizeNote(
        frame.bassNote
      );


    if(!note)
      continue;


    /*
      v2:

      usa confiança real do Bass Detector
      quando ela estiver disponível.
    */

    const confidence =
      Number.isFinite(
        Number(
          frame.bassConfidence
        )
      )
      ?
      clamp(
        Number(
          frame.bassConfidence
        ),
        0.1,
        1
      )
      :
      1;


    counts.set(
      note,
      (
        counts.get(note)
        ||
        0
      )
      +
      confidence
    );


    totalWeight +=
      confidence;

  }


  const ranking =
    [...counts.entries()]
      .sort(
        (a,b) =>
          b[1] - a[1]
      );


  if(
    ranking.length === 0
  ){

    return {

      note:null,

      ratio:0,

      score:0,

      ranking:[]

    };

  }


  const [
    note,
    score
  ] =
    ranking[0];


  return {

    note,

    score,

    ratio:
      totalWeight > 0
      ?
      score / totalWeight
      :
      0,

    ranking:
      ranking.map(
        ([note,value]) => ({

          note,

          score:
            Number(
              value.toFixed(3)
            )

        })
      )

  };

}


/* =========================================
   ACORDE BASE
========================================= */

function baseChordOf(
  segment
){

  if(
    segment
    &&
    typeof segment.baseChord ===
    "string"
  ){

    return segment.baseChord;

  }


  if(
    segment
    &&
    typeof segment.chord ===
    "string"
  ){

    return segment.chord
      .split("/")[0];

  }


  return null;

}


/* =========================================
   PITCH SET
========================================= */

function pitchSetFromChord(
  chord
){

  const analyzed =
    analyzeChord(
      chord
    );


  if(
    !analyzed.valid
  ){

    return null;

  }


  const indexes =
    analyzed.notes
      .map(
        note =>
          noteIndex(note)
      )
      .filter(
        index =>
          index >= 0
      );


  return {

    analyzed,

    indexes:
      [...new Set(indexes)],

    set:
      new Set(indexes)

  };

}


/* =========================================
   PERSISTÊNCIA DE UMA NOTA

   v2:
   não usa apenas "passou de 0.28".

   Também mede a força relativa da nota
   dentro do próprio frame.
========================================= */

function pitchEvidence(
  frames,
  pitch
){

  const energies = [];

  const relativeEnergies = [];

  let presentStrong = 0;

  let valid = 0;


  for(
    const frame
    of frames
  ){

    const chroma =
      normalize12(
        frame.chroma
      );


    if(!chroma)
      continue;


    valid++;


    const energy =
      chroma[pitch];


    const sorted =
      [...chroma]
        .sort(
          (a,b) =>
            b - a
        );


    const reference =
      median(
        sorted.slice(
          0,
          Math.min(
            4,
            sorted.length
          )
        )
      )
      ||
      1;


    const relative =
      energy
      /
      Math.max(
        0.001,
        reference
      );


    energies.push(
      energy
    );


    relativeEnergies.push(
      relative
    );


    if(
      energy >= 0.34
      &&
      relative >= 0.56
    ){

      presentStrong++;

    }

  }


  return {

    medianEnergy:
      energies.length
      ?
      median(energies)
      :
      0,

    relativeEnergy:
      relativeEnergies.length
      ?
      median(
        relativeEnergies
      )
      :
      0,

    persistence:
      valid
      ?
      presentStrong / valid
      :
      0

  };

}


/* =========================================
   SCORE DE RECONSTRUÇÃO

   Mede quanto uma hipótese explica
   a região observada.
========================================= */

function reconstructionMetrics(
  chord,
  frames,
  regionChroma,
  bass
){

  const data =
    pitchSetFromChord(
      chord
    );


  if(!data)
    return null;


  const {
    analyzed,
    indexes,
    set
  } =
    data;


  let inside = 0;

  let outside = 0;


  for(
    let pitch = 0;
    pitch < 12;
    pitch++
  ){

    if(
      set.has(pitch)
    ){

      inside +=
        regionChroma[pitch];

    }

    else{

      outside +=
        regionChroma[pitch];

    }

  }


  const total =
    inside
    +
    outside
    +
    1e-9;


  const coverage =
    inside / total;


  const unexplained =
    outside / total;


  const evidence =
    indexes.map(
      index =>
        pitchEvidence(
          frames,
          index
        )
    );


  const averagePresence =
    evidence.length
    ?
    evidence.reduce(
      (sum,item) =>
        sum
        +
        clamp(
          item.relativeEnergy,
          0,
          1
        ),
      0
    )
    /
    evidence.length
    :
    0;


  const persistence =
    evidence.length
    ?
    evidence.reduce(
      (sum,item) =>
        sum
        +
        item.persistence,
      0
    )
    /
    evidence.length
    :
    0;


  /*
    Notas obrigatórias com pouca evidência
    geram penalidade.
  */

  let missingPenalty = 0;


  for(
    const item
    of evidence
  ){

    if(
      item.relativeEnergy < 0.28
    ){

      missingPenalty +=
        (
          0.28
          -
          item.relativeEnergy
        )
        /
        0.28;

    }

  }


  missingPenalty /=
    Math.max(
      1,
      evidence.length
    );


  /*
    Compatibilidade do baixo.

    Fundamental = máxima.
    Inversão legítima = quase máxima.
    Nota externa = forte penalidade.
  */

  let bassCompatibility =
    0.50;


  if(
    bass.note
  ){

    if(
      bass.note ===
      analyzed.root
    ){

      bassCompatibility =
        1;

    }

    else if(
      analyzed.notes.includes(
        bass.note
      )
    ){

      bassCompatibility =
        0.88;

    }

    else{

      bassCompatibility =
        0.05;

    }


    bassCompatibility *=
      (
        0.55
        +
        0.45
        *
        bass.ratio
      );

  }


  const root =
    noteIndex(
      analyzed.root
    );


  const rootEnergy =
    root >= 0
    ?
    regionChroma[root]
    :
    0;


  const score =
    clamp(

        coverage
        *
        0.32

      +

        (
          1 - unexplained
        )
        *
        0.12

      +

        averagePresence
        *
        0.15

      +

        persistence
        *
        0.17

      +

        (
          1 - missingPenalty
        )
        *
        0.10

      +

        bassCompatibility
        *
        0.10

      +

        rootEnergy
        *
        0.04,

      0,
      1

    );


  return {

    score,

    coverage,

    unexplained,

    averagePresence,

    persistence,

    missingPenalty,

    bassCompatibility,

    rootEnergy

  };

}


/* =========================================
   COMPLEXIDADE HARMÔNICA

   Quanto mais informação o símbolo exige,
   maior precisa ser o ganho acústico.
========================================= */

function qualityComplexity(
  quality
){

  const value =
    String(
      quality
      ||
      ""
    )
    .toUpperCase();


  if(
    value === ""
    ||
    value === "MIN"
  ){

    return 0;

  }


  if(
    value === "SUS2"
    ||
    value === "SUS4"
    ||
    value === "DIM"
    ||
    value === "AUG"
  ){

    return 0.5;

  }


  if(
    value === "7"
    ||
    value === "MIN7"
    ||
    value === "MAJ7"
    ||
    value === "6"
    ||
    value === "MIN6"
    ||
    value === "MIN7B5"
  ){

    return 1;

  }


  return 1.5;

}


/* =========================================
   ACORDE PAI MAIS SIMPLES

   Serve para medir o ganho marginal de
   uma extensão.

   Exemplos:

   Cmaj7 -> C
   C7    -> C
   Cm7   -> Cm
   C6    -> C
   Cm6   -> Cm
   C9    -> C7

   Não existem regras específicas para
   notas ou tonalidades.
========================================= */

function simplerParent(
  candidate
){

  if(!candidate)
    return null;


  const root =
    candidate.root;


  const quality =
    String(
      candidate.quality
      ||
      ""
    )
    .toUpperCase();


  if(!root)
    return null;


  if(
    quality === "MAJ7"
    ||
    quality === "7"
    ||
    quality === "6"
    ||
    quality === "ADD9"
  ){

    return root;

  }


  if(
    quality === "MIN7"
    ||
    quality === "MIN6"
    ||
    quality === "MINADD9"
  ){

    return root + "m";

  }


  if(
    quality === "9"
    ||
    quality === "7B9"
    ||
    quality === "7#9"
    ||
    quality === "7B5"
    ||
    quality === "7#5"
  ){

    return root + "7";

  }


  if(
    quality === "MAJ9"
    ||
    quality === "MAJ7#11"
  ){

    return root + "maj7";

  }


  if(
    quality === "MIN9"
  ){

    return root + "m7";

  }


  /*
    m7b5 não é tratado como simplesmente
    "m7 com extensão".

    A quinta diminuta é estrutural.
  */

  return null;

}


/* =========================================
   GANHO MARGINAL

   Pergunta:

   "A versão mais complexa realmente
   explica algo que o modelo simples
   não explicava?"
========================================= */

function marginalExtensionEvidence(
  candidate,
  frames,
  regionChroma,
  bass
){

  const parentChord =
    simplerParent(
      candidate
    );


  if(!parentChord){

    return {

      parentChord:null,

      parentScore:null,

      marginalGain:null,

      complexityPenalty:0

    };

  }


  const candidateMetrics =
    reconstructionMetrics(
      candidate.chord,
      frames,
      regionChroma,
      bass
    );


  const parentMetrics =
    reconstructionMetrics(
      parentChord,
      frames,
      regionChroma,
      bass
    );


  if(
    !candidateMetrics
    ||
    !parentMetrics
  ){

    return {

      parentChord,

      parentScore:null,

      marginalGain:null,

      complexityPenalty:0

    };

  }


  const marginalGain =
    candidateMetrics.score
    -
    parentMetrics.score;


  /*
    Minimum Description Length simples:

    uma hipótese mais complexa precisa
    comprar seu custo com explicação real.
  */

  const complexity =
    qualityComplexity(
      candidate.quality
    );


  let complexityPenalty = 0;


  if(
    marginalGain < 0.025
  ){

    complexityPenalty =
      0.065
      *
      complexity;

  }

  else if(
    marginalGain < 0.045
  ){

    complexityPenalty =
      0.030
      *
      complexity;

  }


  return {

    parentChord,

    parentScore:
      parentMetrics.score,

    marginalGain,

    complexityPenalty

  };

}


/* =========================================
   CANDIDATOS AMPLIADOS

   v1 analisava só poucos candidatos.

   v2 pede todos os templates disponíveis
   e depois cria um shortlist.

   Isso permite recuperar candidatos cujo
   root coincide com um baixo extremamente
   consistente.
========================================= */

function getExpandedCandidates(
  regionChroma,
  bass,
  originalBase
){

  const all =
    detectChordCandidatesFromChroma(
      regionChroma,
      {

        /*
          O engine atual tem muito menos
          que 256 templates no total.

          Portanto isto nos permite
          observar candidatos que ficaram
          fora do top-8.
        */

        limit:
          256,

        bassNote:
          bass.note,

        bassChroma:
          null

      }
    );


  if(
    all.length === 0
  ){

    return [];
  }


  const bestScore =
    all[0].score;


  const selected =
    new Map();


  /*
    Grupo 1:
    candidatos harmonicamente próximos.
  */

  for(
    const candidate
    of all
  ){

    if(
      bestScore
      -
      candidate.score
      <=
      0.20
    ){

      selected.set(
        candidate.chord,
        candidate
      );

    }

  }


  /*
    Grupo 2:
    candidato original nunca desaparece.
  */

  const original =
    all.find(
      candidate =>
        candidate.chord ===
        originalBase
    );


  if(original){

    selected.set(
      original.chord,
      original
    );

  }


  /*
    Grupo 3 — Candidate Rescue:

    Se o baixo é extremamente consistente,
    permitimos que candidatos cuja root é
    esse baixo entrem na disputa mesmo
    estando mais abaixo no ranking.

    Ainda haverá limite de distância.
  */

  if(
    bass.note
    &&
    bass.ratio >= 0.82
  ){

    for(
      const candidate
      of all
    ){

      if(
        candidate.root !==
        bass.note
      ){

        continue;

      }


      if(
        bestScore
        -
        candidate.score
        >
        0.32
      ){

        continue;

      }


      selected.set(
        candidate.chord,
        candidate
      );

    }

  }


  return [
    ...selected.values()
  ];

}


/* =========================================
   SCORE FINAL DE CANDIDATO
========================================= */

function scoreCandidate(
  candidate,
  frames,
  regionChroma,
  bass,
  bestDetectorScore,
  options
){

  const metrics =
    reconstructionMetrics(
      candidate.chord,
      frames,
      regionChroma,
      bass
    );


  if(!metrics)
    return null;


  const detectorRange =
    Math.max(
      0.001,
      options.detectorRange
    );


  const detectorNorm =
    clamp(

      1
      -
      Math.max(
        0,
        bestDetectorScore
        -
        candidate.score
      )
      /
      detectorRange,

      0,
      1

    );


  const marginal =
    marginalExtensionEvidence(
      candidate,
      frames,
      regionChroma,
      bass
    );


  /*
    Penalidade extremamente importante:

    se o baixo regional é estável e nem
    sequer pertence ao acorde candidato,
    a hipótese precisa de evidência
    excepcional para sobreviver.
  */

  let incompatibleBassPenalty = 0;


  if(
    bass.note
    &&
    bass.ratio >= 0.80
  ){

    const analyzed =
      analyzeChord(
        candidate.chord
      );


    if(
      analyzed.valid
      &&
      !analyzed.notes.includes(
        bass.note
      )
    ){

      incompatibleBassPenalty =
        0.115
        *
        bass.ratio;

    }

  }


  const finalScore =
    (
      detectorNorm
      *
      options.detectorWeight
    )
    +
    (
      metrics.score
      *
      options.reconstructionWeight
    )
    -
    marginal.complexityPenalty
    -
    incompatibleBassPenalty;


  return {

    ...candidate,

    metrics,

    detectorNorm,

    marginal,

    incompatibleBassPenalty,

    finalScore

  };

}


/* =========================================
   FORMATAÇÃO SLASH
========================================= */

function formatSlashChord(
  baseChord,
  bassNote
){

  const analyzed =
    analyzeChord(
      baseChord
    );


  if(!analyzed.valid)
    return baseChord;


  const bass =
    normalizeNote(
      bassNote
    );


  if(
    !bass
    ||
    bass ===
    analyzed.root
  ){

    return baseChord;

  }


  if(
    analyzed.notes.includes(
      bass
    )
  ){

    return (
      baseChord
      +
      "/"
      +
      bass
    );

  }


  return baseChord;

}


/* =========================================
   VALIDAÇÃO REGIONAL
========================================= */

function validateRegion(
  segment,
  frames,
  options
){

  const regionFrames =
    frames.filter(
      frame =>
        Number(frame.time) >=
        Number(segment.start)
        &&
        Number(frame.time) <
        Number(segment.end)
    );


  if(
    regionFrames.length === 0
  ){

    return {

      ...segment,

      reconstructionValidated:
        false,

      reconstructionReason:
        "no-frames"

    };

  }


  const regionChroma =
    medianChroma(
      regionFrames
    );


  if(!regionChroma){

    return {

      ...segment,

      reconstructionValidated:
        false,

      reconstructionReason:
        "no-chroma"

    };

  }


  const bass =
    dominantBass(
      regionFrames
    );


  const originalBase =
    baseChordOf(
      segment
    );


  const candidates =
    getExpandedCandidates(
      regionChroma,
      bass,
      originalBase
    );


  if(
    candidates.length === 0
  ){

    return {

      ...segment,

      reconstructionValidated:
        false,

      reconstructionReason:
        "no-candidates"

    };

  }


  const bestDetectorScore =
    Math.max(
      ...candidates.map(
        candidate =>
          candidate.score
      )
    );


  const scored =
    candidates
      .map(
        candidate =>
          scoreCandidate(
            candidate,
            regionFrames,
            regionChroma,
            bass,
            bestDetectorScore,
            options
          )
      )
      .filter(Boolean)
      .sort(
        (a,b) =>
          b.finalScore
          -
          a.finalScore
      );


  if(
    scored.length === 0
  ){

    return {

      ...segment,

      reconstructionValidated:
        false,

      reconstructionReason:
        "no-scored-candidates"

    };

  }


  const original =
    scored.find(
      candidate =>
        candidate.chord ===
        originalBase
    );


  const winner =
    scored[0];


  /*
    Se o original não apareceu entre os
    candidatos expandidos, não fazemos uma
    troca cega.
  */

  if(!original){

    return {

      ...segment,

      reconstructionValidated:
        false,

      reconstructionReason:
        "original-not-found"

    };

  }


  const finalAdvantage =
    winner.finalScore
    -
    original.finalScore;


  const reconstructionGain =
    winner.metrics.score
    -
    original.metrics.score;


  /*
    Candidate Rescue recebe uma pequena
    exceção lógica:

    se o acorde original é incompatível
    com um baixo extremamente consistente
    e o vencedor contém esse baixo, não
    exigimos o mesmo reconstructionGain.

    Ainda exigimos vantagem final.
  */

  const originalAnalyzed =
    analyzeChord(
      original.chord
    );


  const winnerAnalyzed =
    analyzeChord(
      winner.chord
    );


  const originalRejectsBass =
    bass.note
    &&
    bass.ratio >= 0.88
    &&
    originalAnalyzed.valid
    &&
    !originalAnalyzed.notes.includes(
      bass.note
    );


  const winnerAcceptsBass =
    bass.note
    &&
    winnerAnalyzed.valid
    &&
    winnerAnalyzed.notes.includes(
      bass.note
    );


  const bassRescue =
    originalRejectsBass
    &&
    winnerAcceptsBass
    &&
    finalAdvantage >=
    options.bassRescueAdvantage;


  const normalSwitch =
    winner.chord !==
    original.chord
    &&
    finalAdvantage >=
    options.minFinalAdvantage
    &&
    reconstructionGain >=
    options.minReconstructionGain;


  const shouldSwitch =
    winner.chord !==
    original.chord
    &&
    (
      normalSwitch
      ||
      bassRescue
    );


  const chosen =
    shouldSwitch
    ?
    winner
    :
    original;


  const runnerUp =
    scored.find(
      candidate =>
        candidate.chord !==
        chosen.chord
    );


  const separation =
    runnerUp
    ?
    clamp(
      (
        chosen.finalScore
        -
        runnerUp.finalScore
      )
      /
      0.16,
      0,
      1
    )
    :
    1;


  const oldConfidence =
    Number(
      segment.confidence
      ||
      0
    );


  const newConfidence =
    clamp(

        oldConfidence
        *
        0.35

      +

        chosen.metrics.score
        *
        0.40

      +

        separation
        *
        0.15

      +

        (
          bass.note
          ?
          bass.ratio
          :
          0.5
        )
        *
        0.10,

      0,
      0.95

    );


  const selectedBase =
    chosen.chord;


  return {

    ...segment,

    baseChord:
      selectedBase,

    chord:
      formatSlashChord(
        selectedBase,
        bass.note
        ||
        segment.bassNote
      ),

    notes:
      chosen.notes,

    bassNote:
      bass.note
      ||
      segment.bassNote
      ||
      null,

    confidence:
      Number(
        newConfidence
          .toFixed(3)
      ),

    reconstructionValidated:
      true,

    reconstructionChanged:
      shouldSwitch,

    reconstructionReason:
      shouldSwitch
      ?
      (
        bassRescue
        ?
        "bass-rescue"
        :
        "reconstruction"
      )
      :
      "confirmed",

    reconstruction:{

      score:
        Number(
          chosen.metrics.score
            .toFixed(3)
        ),

      coverage:
        Number(
          chosen.metrics.coverage
            .toFixed(3)
        ),

      persistence:
        Number(
          chosen.metrics.persistence
            .toFixed(3)
        ),

      bassCompatibility:
        Number(
          chosen.metrics
            .bassCompatibility
            .toFixed(3)
        ),

      original:
        original.chord,

      selected:
        selectedBase,

      reconstructionGain:
        Number(
          reconstructionGain
            .toFixed(3)
        ),

      finalAdvantage:
        Number(
          finalAdvantage
            .toFixed(3)
        ),

      detectorNorm:
        Number(
          chosen.detectorNorm
            .toFixed(3)
        ),

      marginal:{

        parent:
          chosen.marginal
            .parentChord,

        gain:
          chosen.marginal
            .marginalGain == null
          ?
          null
          :
          Number(
            chosen.marginal
              .marginalGain
              .toFixed(3)
          ),

        complexityPenalty:
          Number(
            chosen.marginal
              .complexityPenalty
              .toFixed(3)
          )

      },

      bass:{

        note:
          bass.note,

        ratio:
          Number(
            bass.ratio
              .toFixed(3)
          )

      }

    }

  };

}


/* =========================================
   SCORE DE UM ACORDE EM UM FRAME/REGIÃO

   usado pelo Boundary Validator.
========================================= */

function reconstructionForBase(
  baseChord,
  regionFrames
){

  if(
    !baseChord
    ||
    regionFrames.length === 0
  ){

    return null;

  }


  const chroma =
    medianChroma(
      regionFrames
    );


  if(!chroma)
    return null;


  const bass =
    dominantBass(
      regionFrames
    );


  const metrics =
    reconstructionMetrics(
      baseChord,
      regionFrames,
      chroma,
      bass
    );


  if(!metrics)
    return null;


  const analyzed =
    analyzeChord(
      baseChord
    );


  let bassFit = 0;


  if(
    bass.note
    &&
    analyzed.valid
  ){

    if(
      bass.note ===
      analyzed.root
    ){

      bassFit = 1;

    }

    else if(
      analyzed.notes.includes(
        bass.note
      )
    ){

      bassFit = 0.9;

    }

  }


  return {

    score:
      metrics.score,

    bassFit,

    total:
      metrics.score
      +
      bassFit * 0.08

  };

}


/* =========================================
   BOUNDARY VALIDATOR

   Não diz:
   "acorde curto é falso".

   Pergunta:
   "esse segmento possui evidência própria,
   ou um dos vizinhos explica melhor seus
   frames?"
========================================= */

function resolveBoundarySegments(
  timeline,
  frames,
  options
){

  if(
    timeline.length < 3
  ){

    return timeline;

  }


  const output =
    timeline.map(
      item => ({
        ...item
      })
    );


  for(
    let index = 1;
    index < output.length - 1;
    index++
  ){

    const current =
      output[index];


    const previous =
      output[index - 1];


    const next =
      output[index + 1];


    const duration =
      Number(current.end)
      -
      Number(current.start);


    if(
      !Number.isFinite(duration)
      ||
      duration >
      options.boundaryMaxDuration
    ){

      continue;

    }


    const members =
      frames.filter(
        frame =>
          Number(frame.time) >=
          Number(current.start)
          &&
          Number(frame.time) <
          Number(current.end)
      );


    /*
      Boundary mode só existe para regiões
      com pouquíssima evidência temporal.
    */

    if(
      members.length === 0
      ||
      members.length >
      options.boundaryMaxFrames
    ){

      continue;

    }


    const currentBase =
      baseChordOf(
        current
      );


    const previousBase =
      baseChordOf(
        previous
      );


    const nextBase =
      baseChordOf(
        next
      );


    const currentScore =
      reconstructionForBase(
        currentBase,
        members
      );


    const previousScore =
      reconstructionForBase(
        previousBase,
        members
      );


    const nextScore =
      reconstructionForBase(
        nextBase,
        members
      );


    if(
      !currentScore
      ||
      !previousScore
      ||
      !nextScore
    ){

      continue;

    }


    /*
      Também observa a continuidade
      do baixo.

      Se o microsegmento compartilha o baixo
      com um vizinho, isso é evidência de
      que pode pertencer àquele lado.
    */

    const microBass =
      dominantBass(
        members
      );


    let previousContinuity = 0;

    let nextContinuity = 0;


    if(microBass.note){

      const previousBass =
        normalizeNote(
          previous.bassNote
        );


      const nextBass =
        normalizeNote(
          next.bassNote
        );


      if(
        previousBass ===
        microBass.note
      ){

        previousContinuity +=
          0.055;

      }


      if(
        nextBass ===
        microBass.note
      ){

        nextContinuity +=
          0.055;

      }

    }


    const previousTotal =
      previousScore.total
      +
      previousContinuity;


    const nextTotal =
      nextScore.total
      +
      nextContinuity;


    const neighborBest =
      Math.max(
        previousTotal,
        nextTotal
      );


    /*
      Se o próprio microsegmento explica
      claramente melhor seus frames,
      ele sobrevive.

      Assim acordes rápidos verdadeiros
      não são apagados só pela duração.
    */

    if(
      currentScore.total >=
      neighborBest
      +
      options.boundaryOwnAdvantage
    ){

      current.reconstructionBoundary =
        "kept";

      continue;

    }


    /*
      Exigimos que algum vizinho tenha
      vantagem real.
    */

    if(
      neighborBest <
      currentScore.total
      +
      options.boundaryNeighborAdvantage
    ){

      current.reconstructionBoundary =
        "uncertain";

      continue;

    }


    const source =
      previousTotal >= nextTotal
      ?
      previous
      :
      next;


    output[index] = {

      ...current,

      baseChord:
        baseChordOf(
          source
        ),

      chord:
        source.chord,

      notes:
        source.notes,

      bassNote:
        source.bassNote,

      confidence:
        Math.max(
          Number(
            current.confidence
            ||
            0
          ),
          Number(
            source.confidence
            ||
            0
          )
          *
          0.85
        ),

      reconstructionValidated:
        true,

      reconstructionChanged:
        true,

      reconstructionReason:
        "boundary-absorption",

      reconstructionBoundary:
        previousTotal >= nextTotal
        ?
        "previous"
        :
        "next"

    };

  }


  return output;

}


/* =========================================
   MERGE APÓS BOUNDARY RESOLUTION

   Só une símbolos realmente iguais.
========================================= */

function mergeEquivalentSegments(
  timeline
){

  const merged = [];


  for(
    const segment
    of timeline
  ){

    const previous =
      merged[
        merged.length - 1
      ];


    if(
      previous
      &&
      previous.chord ===
      segment.chord
    ){

      previous.end =
        segment.end;


      previous.confidence =
        Number(
          Math.max(
            Number(
              previous.confidence
              ||
              0
            ),
            Number(
              segment.confidence
              ||
              0
            )
          )
          .toFixed(3)
        );


      continue;

    }


    merged.push({
      ...segment
    });

  }


  return merged;

}


/* =========================================
   API PÚBLICA
========================================= */

export function validateChordTimeline(
  timeline,
  frames,
  userOptions = {}
){

  if(
    !Array.isArray(timeline)
    ||
    !Array.isArray(frames)
  ){

    return Array.isArray(timeline)
      ?
      timeline
      :
      [];

  }


  const detectorWeight =
    Number.isFinite(
      Number(
        userOptions.detectorWeight
      )
    )
    ?
    clamp(
      Number(
        userOptions.detectorWeight
      ),
      0.20,
      0.80
    )
    :
    0.48;


  const options = {

    detectorWeight,

    reconstructionWeight:
      1 - detectorWeight,

    detectorRange:
      Number.isFinite(
        Number(
          userOptions.detectorRange
        )
      )
      ?
      Number(
        userOptions.detectorRange
      )
      :
      0.30,

    minFinalAdvantage:
      Number.isFinite(
        Number(
          userOptions.minFinalAdvantage
        )
      )
      ?
      Number(
        userOptions.minFinalAdvantage
      )
      :
      0.035,

    minReconstructionGain:
      Number.isFinite(
        Number(
          userOptions.minReconstructionGain
        )
      )
      ?
      Number(
        userOptions.minReconstructionGain
      )
      :
      0.025,

    bassRescueAdvantage:
      Number.isFinite(
        Number(
          userOptions.bassRescueAdvantage
        )
      )
      ?
      Number(
        userOptions.bassRescueAdvantage
      )
      :
      0.020,

    boundaryMaxDuration:
      Number.isFinite(
        Number(
          userOptions.boundaryMaxDuration
        )
      )
      ?
      Number(
        userOptions.boundaryMaxDuration
      )
      :
      0.32,

    boundaryMaxFrames:
      Number.isFinite(
        Number(
          userOptions.boundaryMaxFrames
        )
      )
      ?
      Math.max(
        1,
        Number(
          userOptions.boundaryMaxFrames
        )
      )
      :
      2,

    boundaryOwnAdvantage:
      Number.isFinite(
        Number(
          userOptions.boundaryOwnAdvantage
        )
      )
      ?
      Number(
        userOptions.boundaryOwnAdvantage
      )
      :
      0.045,

    boundaryNeighborAdvantage:
      Number.isFinite(
        Number(
          userOptions.boundaryNeighborAdvantage
        )
      )
      ?
      Number(
        userOptions.boundaryNeighborAdvantage
      )
      :
      0.015

  };


  /*
    PASSO 1:
    reconstrução regional.
  */

  const validated =
    timeline.map(
      segment =>
        validateRegion(
          segment,
          frames,
          options
        )
    );


  /*
    PASSO 2:
    frames/segmentos de fronteira.
  */

  const boundaries =
    resolveBoundarySegments(
      validated,
      frames,
      options
    );


  /*
    PASSO 3:
    junta regiões que ficaram iguais
    depois da validação.
  */

  return mergeEquivalentSegments(
    boundaries
  );

}
