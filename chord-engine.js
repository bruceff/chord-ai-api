/* =========================================
   CHORD AI — CHORD ENGINE v8

   Novidades:
   - Root Consensus v2
   - Root Correction
   - Correção de acordes vizinhos
   - Correção dominante vs diminuto
   - Correção m7b5 vs maj7 vizinho
   - Decoder temporal mantido
========================================= */


/* =========================================
   NOTAS
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


/* =========================================
   ENARMONIA
========================================= */

const ENHARMONIC = {

  "DB":"C#",
  "EB":"D#",
  "GB":"F#",
  "AB":"G#",
  "BB":"A#",

  "CB":"B",
  "FB":"E",

  "E#":"F",
  "B#":"C"

};


/* =========================================
   TIPOS DE ACORDES
========================================= */

const CHORD_TYPES = {

  "":
    [0,4,7],

  "MIN":
    [0,3,7],

  "7":
    [0,4,7,10],

  "MIN7":
    [0,3,7,10],

  "MAJ7":
    [0,4,7,11],

  "6":
    [0,4,7,9],

  "MIN6":
    [0,3,7,9],

  "9":
    [0,4,7,10,14],

  "MAJ9":
    [0,4,7,11,14],

  "MIN9":
    [0,3,7,10,14],

  "SUS2":
    [0,2,7],

  "SUS4":
    [0,5,7],

  "7SUS4":
    [0,5,7,10],

  "DIM":
    [0,3,6],

  "DIM7":
    [0,3,6,9],

  "MIN7B5":
    [0,3,6,10],

  "AUG":
    [0,4,8],

  "ADD9":
    [0,4,7,14],

  "MINADD9":
    [0,3,7,14],

  "7B5":
    [0,4,6,10],

  "7#5":
    [0,4,8,10],

  "7B9":
    [0,4,7,10,13],

  "7#9":
    [0,4,7,10,15],

  "MAJ7#11":
    [0,4,7,11,18]

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
    ? value
    : null;

}


function noteIndex(
  note
){

  const normalized =
    normalizeNote(note);


  if(!normalized)
    return -1;


  return NOTES.indexOf(
    normalized
  );

}


function normalizeVector12(
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
            ? Math.max(0,n)
            : 0;

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


function normalizeChroma(
  chroma
){

  return normalizeVector12(
    chroma
  );

}


function pitchDistance(
  a,
  b
){

  const diff =
    Math.abs(
      a - b
    );


  return Math.min(
    diff,
    12 - diff
  );

}


function circularDistanceForward(
  from,
  to
){

  return (
    to - from + 12
  ) % 12;

}


/* =========================================
   PITCH CLASSES
========================================= */

function getPitchClasses(
  intervals
){

  return [
    ...new Set(
      intervals.map(
        value =>
          value % 12
      )
    )
  ];

}


/* =========================================
   QUALIDADE -> SÍMBOLO
========================================= */

function qualityToSymbol(
  quality
){

  const map = {

    "":
      "",

    "MIN":
      "m",

    "7":
      "7",

    "MIN7":
      "m7",

    "MAJ7":
      "maj7",

    "6":
      "6",

    "MIN6":
      "m6",

    "9":
      "9",

    "MAJ9":
      "maj9",

    "MIN9":
      "m9",

    "SUS2":
      "sus2",

    "SUS4":
      "sus4",

    "7SUS4":
      "7sus4",

    "DIM":
      "dim",

    "DIM7":
      "dim7",

    "MIN7B5":
      "m7b5",

    "AUG":
      "aug",

    "ADD9":
      "add9",

    "MINADD9":
      "madd9",

    "7B5":
      "7b5",

    "7#5":
      "7#5",

    "7B9":
      "7b9",

    "7#9":
      "7#9",

    "MAJ7#11":
      "maj7#11"

  };


  return (
    map[quality]
    ??
    quality.toLowerCase()
  );

}


/* =========================================
   NORMALIZAR QUALIDADE
========================================= */

function normalizeQuality(
  quality
){

  if(
    quality == null
    ||
    quality === ""
  ){

    return "";

  }


  let value =
    String(quality)
      .trim()
      .replace(/major/gi,"maj")
      .replace(/minor/gi,"min")
      .replace(/Δ/g,"maj")
      .replace(/ø/g,"m7b5")
      .replace(/°/g,"dim");


  if(/^m$/i.test(value))
    return "MIN";

  if(/^min$/i.test(value))
    return "MIN";

  if(/^m7$/i.test(value))
    return "MIN7";

  if(/^m6$/i.test(value))
    return "MIN6";

  if(/^m9$/i.test(value))
    return "MIN9";

  if(/^m7b5$/i.test(value))
    return "MIN7B5";

  if(/^madd9$/i.test(value))
    return "MINADD9";

  if(/^maj$/i.test(value))
    return "";

  if(value === "+")
    return "AUG";


  return value.toUpperCase();

}


/* =========================================
   PARSER
========================================= */

function parseChordSymbol(
  symbol
){

  if(
    typeof symbol !== "string"
  ){

    return null;

  }


  const value =
    symbol
      .trim()
      .replace(/\s+/g,"");


  if(!value)
    return null;


  const slash =
    value.split("/");


  const chordPart =
    slash[0];


  const bassPart =
    slash[1]
    ||
    null;


  const match =
    chordPart.match(
      /^([A-Ga-g])([#b♯♭]?)(.*)$/
    );


  if(!match)
    return null;


  const root =
    normalizeNote(
      match[1]
      +
      (
        match[2]
        ||
        ""
      )
    );


  if(!root)
    return null;


  return {

    root,

    quality:
      normalizeQuality(
        match[3]
        ||
        ""
      ),

    bass:
      bassPart
      ?
      normalizeNote(
        bassPart
      )
      :
      null

  };

}


/* =========================================
   TRANSPOR NOTA
========================================= */

export function transposeNote(
  note,
  semitones
){

  const index =
    noteIndex(note);


  if(index < 0)
    return null;


  let next =
    (
      index
      +
      Number(semitones)
    ) % 12;


  if(next < 0)
    next += 12;


  return NOTES[next];

}


/* =========================================
   ANALISAR ACORDE
========================================= */

export function analyzeChord(
  symbol
){

  const parsed =
    parseChordSymbol(
      symbol
    );


  if(!parsed){

    return {

      valid:false,

      chord:
        symbol,

      error:
        "Acorde inválido"

    };

  }


  const intervals =
    CHORD_TYPES[
      parsed.quality
    ];


  if(!intervals){

    return {

      valid:false,

      chord:
        symbol,

      error:
        "Tipo de acorde não suportado"

    };

  }


  const rootIndex =
    noteIndex(
      parsed.root
    );


  const notes =
    [
      ...new Set(

        intervals.map(
          interval =>
            NOTES[
              (
                rootIndex
                +
                interval
              ) % 12
            ]
        )

      )
    ];


  let voicing =
    [...notes];


  if(
    parsed.bass
  ){

    voicing = [

      parsed.bass,

      ...notes.filter(
        note =>
          note !==
          parsed.bass
      )

    ];

  }


  return {

    valid:true,

    chord:
      symbol,

    root:
      parsed.root,

    quality:
      parsed.quality,

    bass:
      parsed.bass
      ||
      parsed.root,

    notes,

    voicing,

    intervals

  };

}


/* =========================================
   TRANSPOR ACORDE
========================================= */

export function transposeChord(
  symbol,
  semitones
){

  const parsed =
    parseChordSymbol(
      symbol
    );


  if(!parsed)
    return null;


  let result =
    transposeNote(
      parsed.root,
      semitones
    )
    +
    qualityToSymbol(
      parsed.quality
    );


  if(
    parsed.bass
  ){

    result +=
      "/"
      +
      transposeNote(
        parsed.bass,
        semitones
      );

  }


  return result;

}


/* =========================================
   FAMÍLIAS
========================================= */

function isExtendedQuality(
  quality
){

  return [
    "9",
    "MAJ9",
    "MIN9",
    "ADD9",
    "MINADD9",
    "7B9",
    "7#9",
    "MAJ7#11"
  ].includes(
    quality
  );

}


function isDiminishedQuality(
  quality
){

  return [
    "DIM",
    "DIM7",
    "MIN7B5"
  ].includes(
    quality
  );

}


/* =========================================
   ROOT CONSENSUS v2
========================================= */

function getRootConsensus(
  chroma,
  bassChroma,
  bassNote
){

  const harmonic =
    normalizeChroma(
      chroma
    );


  const bass =
    normalizeVector12(
      bassChroma
    );


  const result =
    new Array(12)
      .fill(0);


  const bassIndex =
    noteIndex(
      bassNote
    );


  for(
    let i = 0;
    i < 12;
    i++
  ){

    /*
      Chroma geral.
    */

    if(harmonic){

      result[i] +=
        harmonic[i]
        *
        0.25;

    }


    /*
      Região grave.
    */

    if(bass){

      result[i] +=
        bass[i]
        *
        0.50;

    }


    /*
      Nota grave detectada.
    */

    if(
      bassIndex === i
    ){

      result[i] +=
        0.62;

    }

  }


  const max =
    Math.max(
      ...result
    );


  if(max > 0){

    for(
      let i = 0;
      i < 12;
      i++
    ){

      result[i] /=
        max;

    }

  }


  return result;

}


/* =========================================
   SCORE DA FUNDAMENTAL
========================================= */

function scoreRoot(
  rootIndex,
  rootConsensus,
  bassNote,
  bassChroma
){

  let score = 0;


  const bassIndex =
    noteIndex(
      bassNote
    );


  const bass =
    normalizeVector12(
      bassChroma
    );


  if(rootConsensus){

    score +=
      rootConsensus[
        rootIndex
      ]
      *
      0.34;

  }


  if(
    bassIndex >= 0
  ){

    if(
      bassIndex === rootIndex
    ){

      score +=
        0.26;

    }

    else{

      const distance =
        pitchDistance(
          rootIndex,
          bassIndex
        );


      score -=
        distance
        *
        0.014;

    }

  }


  if(bass){

    score +=
      bass[
        rootIndex
      ]
      *
      0.18;

  }


  return score;

}


/* =========================================
   SCORE HARMÔNICO
========================================= */

function scoreChordTemplate(
  chroma,
  rootIndex,
  quality,
  intervals,
  context = {}
){

  const relative =
    getPitchClasses(
      intervals
    );


  const pitches =
    relative.map(
      interval =>
        (
          rootIndex
          +
          interval
        ) % 12
    );


  const set =
    new Set(
      pitches
    );


  const structural =
    pitches.map(
      pitch =>
        chroma[pitch]
    );


  const insideEnergy =
    structural.reduce(
      (sum,value) =>
        sum + value,
      0
    );


  let outsideEnergy = 0;


  for(
    let i = 0;
    i < 12;
    i++
  ){

    if(
      !set.has(i)
    ){

      outsideEnergy +=
        chroma[i];

    }

  }


  const total =
    insideEnergy
    +
    outsideEnergy
    +
    1e-9;


  const explained =
    insideEnergy
    /
    total;


  const averageInside =
    insideEnergy
    /
    structural.length;


  const rootEnergy =
    chroma[
      rootIndex
    ];


  const weakest =
    Math.min(
      ...structural
    );


  let score =
    averageInside * 0.30
    +
    explained * 0.25
    +
    rootEnergy * 0.07
    +
    weakest * 0.05;


  score +=
    scoreRoot(
      rootIndex,
      context.rootConsensus,
      context.bassNote,
      context.bassChroma
    );


  /* =====================================
     ROOT AUSENTE
  ===================================== */

  if(
    rootEnergy < 0.10
  ){

    score -=
      0.07;

  }


  /* =====================================
     OUTSIDE ENERGY
  ===================================== */

  score -=
    (
      outsideEnergy / 12
    )
    *
    0.11;


  /* =====================================
     TRÍADE IGNORANDO NOTA FORTE
  ===================================== */

  if(
    pitches.length === 3
  ){

    let strongOutside = 0;


    for(
      let i = 0;
      i < 12;
      i++
    ){

      if(
        !set.has(i)
        &&
        chroma[i] >= 0.42
      ){

        strongOutside++;

      }

    }


    score -=
      strongOutside
      *
      0.06;

  }


  /* =====================================
     TÉTRADE
  ===================================== */

  if(
    pitches.length === 4
  ){

    const fourth =
      structural[3];


    if(
      fourth >= 0.30
    ){

      score +=
        0.04;

    }

  }


  /* =====================================
     DIMINUTOS
  ===================================== */

  if(
    isDiminishedQuality(
      quality
    )
  ){

    const rootSupport =
      context.rootConsensus
      ?
      context.rootConsensus[
        rootIndex
      ]
      :
      0;


    if(
      rootSupport < 0.50
    ){

      score -=
        0.10;

    }

  }


  /* =====================================
     DOMINANTE 7
  ===================================== */

  if(
    quality === "7"
  ){

    const bassIndex =
      noteIndex(
        context.bassNote
      );


    if(
      bassIndex === rootIndex
    ){

      score +=
        0.10;

    }

  }


  /* =====================================
     MIN7
  ===================================== */

  if(
    quality === "MIN7"
  ){

    const bassIndex =
      noteIndex(
        context.bassNote
      );


    if(
      bassIndex === rootIndex
    ){

      score +=
        0.095;

    }

  }


  /* =====================================
     MAJ7
  ===================================== */

  if(
    quality === "MAJ7"
  ){

    const bassIndex =
      noteIndex(
        context.bassNote
      );


    if(
      bassIndex === rootIndex
    ){

      score +=
        0.09;

    }

  }


  /* =====================================
     M7B5
  ===================================== */

  if(
    quality === "MIN7B5"
  ){

    const bassIndex =
      noteIndex(
        context.bassNote
      );


    if(
      bassIndex === rootIndex
    ){

      score +=
        0.11;

    }

  }


  /* =====================================
     EXTENSÕES
  ===================================== */

  if(
    isExtendedQuality(
      quality
    )
  ){

    score -=
      0.025;

  }


  return {

    score,

    pitches,

    rootEnergy,

    explained

  };

}


/* =========================================
   CRIAR CANDIDATOS
========================================= */

function buildCandidates(
  chroma,
  options = {}
){

  const normalized =
    normalizeChroma(
      chroma
    );


  if(!normalized)
    return [];


  const rootConsensus =
    getRootConsensus(
      normalized,
      options.bassChroma,
      options.bassNote
    );


  const candidates = [];


  for(
    let rootIndex = 0;
    rootIndex < 12;
    rootIndex++
  ){

    for(
      const [
        quality,
        intervals
      ]
      of
      Object.entries(
        CHORD_TYPES
      )
    ){

      const result =
        scoreChordTemplate(
          normalized,
          rootIndex,
          quality,
          intervals,
          {

            rootConsensus,

            bassNote:
              options.bassNote,

            bassChroma:
              options.bassChroma

          }
        );


      candidates.push({

        chord:
          NOTES[
            rootIndex
          ]
          +
          qualityToSymbol(
            quality
          ),

        root:
          NOTES[
            rootIndex
          ],

        rootIndex,

        quality,

        notes:
          result.pitches.map(
            pitch =>
              NOTES[pitch]
          ),

        score:
          result.score,

        rootConsensus:
          rootConsensus[
            rootIndex
          ],

        bassNote:
          options.bassNote
          ||
          null

      });

    }

  }


  return candidates;

}


/* =========================================
   ROOT CORRECTION v8
========================================= */

function applyRootCorrection(
  candidates,
  chroma,
  bassNote,
  bassChroma
){

  if(
    !Array.isArray(candidates)
    ||
    candidates.length < 2
  ){

    return candidates;

  }


  const normalized =
    normalizeChroma(
      chroma
    );


  const bassIndex =
    noteIndex(
      bassNote
    );


  const bass =
    normalizeVector12(
      bassChroma
    );


  const sorted =
    [...candidates]
      .sort(
        (a,b) =>
          b.score
          -
          a.score
      );


  let best =
    sorted[0];


  /* =====================================
     REGRA 1:
     VENCEDOR COM ROOT A 1 SEMITOM
     DO BAIXO
  ===================================== */

  if(
    bassIndex >= 0
    &&
    best.rootIndex !==
    bassIndex
  ){

    const distance =
      pitchDistance(
        best.rootIndex,
        bassIndex
      );


    if(
      distance === 1
    ){

      const bassRootCandidates =
        sorted.filter(
          candidate =>
            candidate.rootIndex ===
            bassIndex
        );


      if(
        bassRootCandidates.length > 0
      ){

        const alternative =
          bassRootCandidates[0];


        const scoreDifference =
          best.score
          -
          alternative.score;


        /*
          Se estiver muito próximo,
          preferimos a root indicada
          pelo baixo.
        */

        if(
          scoreDifference <
          0.18
        ){

          alternative.score +=
            0.20;

        }

      }

    }

  }


  /* =====================================
     REGRA 2:
     DOMINANTE 7 vs DIMINUTO CONTIDO

     Ex:
     E7 = E G# B D
     G#dim = G# B D

     Se E aparece forte no baixo/chroma,
     E7 deve vencer.
  ===================================== */

  for(
    const candidate
    of sorted
  ){

    if(
      candidate.quality !==
      "7"
    ){

      continue;

    }


    const root =
      candidate.rootIndex;


    const rootEnergy =
      normalized
      ?
      normalized[root]
      :
      0;


    const bassEnergy =
      bass
      ?
      bass[root]
      :
      0;


    if(
      rootEnergy >= 0.35
      &&
      (
        bassIndex === root
        ||
        bassEnergy >= 0.55
      )
    ){

      candidate.score +=
        0.16;

    }

  }


  /* =====================================
     REGRA 3:
     MIN7B5 vs MAJ7 VIZINHO

     Ex:
     Bm7b5 vs A#maj7

     Se o baixo aponta para B,
     damos vantagem forte ao Bm7b5.
  ===================================== */

  if(
    bassIndex >= 0
  ){

    for(
      const candidate
      of sorted
    ){

      if(
        candidate.rootIndex ===
        bassIndex
        &&
        candidate.quality ===
        "MIN7B5"
      ){

        candidate.score +=
          0.17;

      }

    }

  }


  /* =====================================
     REGRA 4:
     MAJ7 com root do baixo
  ===================================== */

  if(
    bassIndex >= 0
  ){

    for(
      const candidate
      of sorted
    ){

      if(
        candidate.rootIndex ===
        bassIndex
        &&
        candidate.quality ===
        "MAJ7"
      ){

        candidate.score +=
          0.13;

      }

    }

  }


  /* =====================================
     REGRA 5:
     ROOT FORTE NO CHROMA

     Se uma nota candidata à root está
     muito forte e o vencedor atual está
     deslocado um semitom, corrigimos.
  ===================================== */

  if(normalized){

    const strongestRootIndex =
      normalized.indexOf(
        Math.max(
          ...normalized
        )
      );


    const distance =
      pitchDistance(
        best.rootIndex,
        strongestRootIndex
      );


    if(
      distance === 1
    ){

      const rootCandidates =
        sorted.filter(
          candidate =>
            candidate.rootIndex ===
            strongestRootIndex
        );


      if(
        rootCandidates.length
      ){

        const alternative =
          rootCandidates[0];


        if(
          best.score
          -
          alternative.score
          <
          0.12
        ){

          alternative.score +=
            0.13;

        }

      }

    }

  }


  /*
    Reordena depois das correções.
  */

  sorted.sort(
    (a,b) =>
      b.score
      -
      a.score
  );


  return sorted;

}


/* =========================================
   CANDIDATOS PÚBLICOS
========================================= */

export function detectChordCandidatesFromChroma(
  chroma,
  options = {}
){

  let candidates =
    buildCandidates(
      chroma,
      options
    );


  candidates =
    applyRootCorrection(
      candidates,
      chroma,
      options.bassNote,
      options.bassChroma
    );


  const limit =
    Number.isFinite(
      Number(
        options.limit
      )
    )
    ?
    Math.max(
      1,
      Math.floor(
        Number(
          options.limit
        )
      )
    )
    :
    8;


  return candidates
    .slice(
      0,
      limit
    )
    .map(
      candidate => ({

        ...candidate,

        confidence:
          clamp(
            Number(
              candidate.score
                .toFixed(3)
            ),
            0,
            1
          )

      })
    );

}


/* =========================================
   DETECTAR ACORDE
========================================= */

export function detectChordFromChroma(
  chroma,
  options = {}
){

  const candidates =
    detectChordCandidatesFromChroma(
      chroma,
      {

        limit:5,

        bassNote:
          options.bassNote,

        bassChroma:
          options.bassChroma

      }
    );


  if(
    candidates.length === 0
  ){

    return {

      valid:false,

      error:
        "Sem energia harmônica"

    };

  }


  const best =
    candidates[0];


  if(
    best.score < 0.26
  ){

    return {

      valid:false,

      error:
        "Nenhum acorde confiável",

      candidates

    };

  }


  return {

    valid:true,

    chord:
      best.chord,

    root:
      best.root,

    quality:
      best.quality,

    bass:
      options.bassNote
      ||
      null,

    confidence:
      best.confidence,

    expectedNotes:
      best.notes,

    alternatives:
      candidates.slice(1)

  };

}


/* =========================================
   DETECTOR POR NOTAS
========================================= */

export function detectChord(
  inputNotes
){

  if(
    !Array.isArray(inputNotes)
    ||
    inputNotes.length < 2
  ){

    return {

      valid:false,

      error:
        "Notas insuficientes"

    };

  }


  const chroma =
    new Array(12)
      .fill(0);


  for(
    const note
    of inputNotes
  ){

    const index =
      noteIndex(
        note
      );


    if(
      index >= 0
    ){

      chroma[index] =
        1;

    }

  }


  return detectChordFromChroma(
    chroma
  );

}


/* =========================================
   DECODER TEMPORAL v8
========================================= */

export function decodeChordSequenceFromChroma(
  frames,
  options = {}
){

  if(
    !Array.isArray(frames)
    ||
    frames.length === 0
  ){

    return [];

  }


  const candidateLimit =
    Number.isFinite(
      Number(
        options.candidateLimit
      )
    )
    ?
    Number(
      options.candidateLimit
    )
    :
    6;


  const validFrames =
    frames
      .map(
        frame => {

          const time =
            Number(
              frame.time
            );


          if(
            !Number.isFinite(time)
          ){

            return null;

          }


          const candidates =
            detectChordCandidatesFromChroma(
              frame.chroma,
              {

                limit:
                  candidateLimit,

                bassNote:
                  frame.bassNote,

                bassChroma:
                  frame.bassChroma

              }
            );


          return {

            time,

            bassNote:
              frame.bassNote
              ||
              null,

            candidates

          };

        }
      )
      .filter(Boolean);


  if(
    validFrames.length === 0
  ){

    return [];

  }


  const changePenalty =
    Number.isFinite(
      Number(
        options.changePenalty
      )
    )
    ?
    Number(
      options.changePenalty
    )
    :
    0.18;


  const stayBonus =
    Number.isFinite(
      Number(
        options.stayBonus
      )
    )
    ?
    Number(
      options.stayBonus
    )
    :
    0.055;


  const emissionWeight =
    Number.isFinite(
      Number(
        options.emissionWeight
      )
    )
    ?
    Number(
      options.emissionWeight
    )
    :
    1.45;


  const dp = [];


  /* =====================================
     PRIMEIRO FRAME
  ===================================== */

  const firstStates =
    validFrames[0]
      .candidates
      .map(
        candidate => ({

          chord:
            candidate.chord,

          candidate,

          score:
            candidate.score
            *
            emissionWeight,

          previous:
            null

        })
      );


  firstStates.push({

    chord:"N",

    candidate:null,

    score:0.02,

    previous:null

  });


  dp.push(
    firstStates
  );


  /* =====================================
     FRAMES SEGUINTES
  ===================================== */

  for(
    let t = 1;
    t < validFrames.length;
    t++
  ){

    const candidates = [

      ...validFrames[t]
        .candidates,

      null

    ];


    const states = [];


    for(
      const candidate
      of candidates
    ){

      const chord =
        candidate
        ?
        candidate.chord
        :
        "N";


      const emission =
        candidate
        ?
        candidate.score
        *
        emissionWeight
        :
        0.015;


      let bestPreviousIndex =
        -1;


      let bestScore =
        -Infinity;


      const previousStates =
        dp[
          t - 1
        ];


      for(
        let p = 0;
        p < previousStates.length;
        p++
      ){

        const previous =
          previousStates[p];


        let transition = 0;


        if(
          previous.chord === chord
        ){

          transition +=
            stayBonus;

        }

        else{

          transition -=
            changePenalty;


          if(
            previous.chord === "N"
            ||
            chord === "N"
          ){

            transition +=
              changePenalty
              *
              0.35;

          }

        }


        /*
          Se o baixo atual é a root
          do candidato, favorecemos
          a mudança verdadeira.
        */

        if(
          candidate
          &&
          validFrames[t]
            .bassNote
        ){

          const bassIndex =
            noteIndex(
              validFrames[t]
                .bassNote
            );


          if(
            bassIndex ===
            candidate.rootIndex
          ){

            transition +=
              0.05;

          }

        }


        /*
          Evita root drift de 1 semitom.
        */

        if(
          candidate
          &&
          previous.candidate
          &&
          candidate.rootIndex !==
          previous.candidate.rootIndex
        ){

          const distance =
            pitchDistance(
              candidate.rootIndex,
              previous.candidate.rootIndex
            );


          if(
            distance === 1
          ){

            const bassIndex =
              noteIndex(
                validFrames[t]
                  .bassNote
              );


            if(
              bassIndex !==
              candidate.rootIndex
            ){

              transition -=
                0.06;

            }

          }

        }


        if(
          candidate
          &&
          isExtendedQuality(
            candidate.quality
          )
          &&
          previous.chord !== chord
        ){

          transition -=
            0.02;

        }


        const total =
          previous.score
          +
          emission
          +
          transition;


        if(
          total >
          bestScore
        ){

          bestScore =
            total;

          bestPreviousIndex =
            p;

        }

      }


      states.push({

        chord,

        candidate,

        score:
          bestScore,

        previous:
          bestPreviousIndex

      });

    }


    dp.push(
      states
    );

  }


  /* =====================================
     BACKTRACK
  ===================================== */

  const lastStates =
    dp[
      dp.length - 1
    ];


  let bestLastIndex = 0;


  for(
    let i = 1;
    i < lastStates.length;
    i++
  ){

    if(
      lastStates[i].score >
      lastStates[
        bestLastIndex
      ].score
    ){

      bestLastIndex =
        i;

    }

  }


  const decoded =
    new Array(
      validFrames.length
    );


  let stateIndex =
    bestLastIndex;


  for(
    let t =
      validFrames.length - 1;
    t >= 0;
    t--
  ){

    const state =
      dp[t][stateIndex];


    decoded[t] = {

      time:
        validFrames[t].time,

      chord:
        state.chord,

      confidence:
        state.candidate
        ?
        state.candidate.confidence
        :
        0,

      notes:
        state.candidate
        ?
        state.candidate.notes
        :
        [],

      bassNote:
        validFrames[t]
          .bassNote
        ||
        null

    };


    stateIndex =
      state.previous;


    if(
      stateIndex == null
      ||
      stateIndex < 0
    ){

      stateIndex = 0;

    }

  }


  return decoded;

}


/* =========================================
   SEQUÊNCIA -> TIMELINE
========================================= */

export function decodedSequenceToTimeline(
  sequence,
  options = {}
){

  if(
    !Array.isArray(sequence)
    ||
    sequence.length === 0
  ){

    return [];

  }


  let defaultStep =
    Number.isFinite(
      Number(
        options.defaultStep
      )
    )
    ?
    Number(
      options.defaultStep
    )
    :
    0.20;


  if(
    sequence.length >= 2
  ){

    const diff =
      sequence[1].time
      -
      sequence[0].time;


    if(diff > 0){

      defaultStep =
        diff;

    }

  }


  const timeline = [];


  for(
    let i = 0;
    i < sequence.length;
    i++
  ){

    const current =
      sequence[i];


    const next =
      sequence[
        i + 1
      ];


    const start =
      current.time;


    const end =
      next
      ?
      next.time
      :
      start
      +
      defaultStep;


    const previous =
      timeline[
        timeline.length - 1
      ];


    if(
      previous
      &&
      previous.chord ===
      current.chord
    ){

      previous.end =
        end;


      continue;

    }


    timeline.push({

      start,

      end,

      chord:
        current.chord,

      notes:
        current.notes,

      bassNote:
        current.bassNote,

      confidence:
        current.confidence

    });

  }


  return timeline;

}


/* =========================================
   PIPELINE CHROMA
========================================= */

export function detectChordTimelineFromChroma(
  frames,
  options = {}
){

  const decoded =
    decodeChordSequenceFromChroma(
      frames,
      options
    );


  return decodedSequenceToTimeline(
    decoded
  );

}


/* =========================================
   TIMELINE POR NOTAS
========================================= */

export function detectChordTimeline(
  frames
){

  if(
    !Array.isArray(frames)
  ){

    return [];

  }


  const converted =
    frames.map(
      frame => {

        const chroma =
          new Array(12)
            .fill(0);


        if(
          Array.isArray(
            frame.notes
          )
        ){

          for(
            const note
            of frame.notes
          ){

            const index =
              noteIndex(
                note
              );


            if(
              index >= 0
            ){

              chroma[index] = 1;

            }

          }

        }


        return {

          time:
            frame.time,

          chroma,

          bassChroma:
            null,

          bassNote:
            null

        };

      }
    );


  return detectChordTimelineFromChroma(
    converted
  );

}


/* =========================================
   ESTABILIZADOR
========================================= */

export function stabilizeChordTimeline(
  timeline,
  options = {}
){

  if(
    !Array.isArray(timeline)
    ||
    timeline.length === 0
  ){

    return [];

  }


  const minDuration =
    Number.isFinite(
      Number(
        options.minDuration
      )
    )
    ?
    Number(
      options.minDuration
    )
    :
    0.45;


  const segments =
    timeline.map(
      item => ({
        ...item
      })
    );


  for(
    let i = 0;
    i < segments.length;
    i++
  ){

    const current =
      segments[i];


    const duration =
      current.end
      -
      current.start;


    if(
      duration >=
      minDuration
    ){

      continue;

    }


    const previous =
      i > 0
      ?
      segments[
        i - 1
      ]
      :
      null;


    const next =
      i <
      segments.length - 1
      ?
      segments[
        i + 1
      ]
      :
      null;


    if(
      previous
      &&
      next
      &&
      previous.chord ===
      next.chord
    ){

      current.chord =
        previous.chord;

      current.notes =
        previous.notes;

      current.bassNote =
        previous.bassNote;

      current.confidence =
        Math.max(
          previous.confidence || 0,
          next.confidence || 0
        );

      continue;

    }


    if(
      previous
      &&
      next
    ){

      const source =
        (
          previous.confidence || 0
        )
        >=
        (
          next.confidence || 0
        )
        ?
        previous
        :
        next;


      current.chord =
        source.chord;

      current.notes =
        source.notes;

      current.bassNote =
        source.bassNote;

      current.confidence =
        source.confidence;

    }

  }


  const merged = [];


  for(
    const segment
    of segments
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

      continue;

    }


    merged.push({
      ...segment
    });

  }


  return merged;

}


/* =========================================
   NORMALIZAR TIMELINE
========================================= */

export function normalizeTimeline(
  chords
){

  if(
    !Array.isArray(chords)
  ){

    return [];

  }


  return chords
    .map(
      (item,index) => {

        if(
          item.chord === "N"
        ){

          return {

            index,

            start:
              Number(
                item.start
              ),

            end:
              Number(
                item.end
              ),

            chord:
              "N",

            root:
              null,

            bass:
              item.bassNote
              ||
              null,

            notes:
              [],

            voicing:
              [],

            confidence:
              item.confidence
              ??
              null

          };

        }


        const chord =
          analyzeChord(
            item.chord
          );


        if(!chord.valid)
          return null;


        return {

          index,

          start:
            Number(
              item.start
            ),

          end:
            Number(
              item.end
            ),

          chord:
            item.chord,

          root:
            chord.root,

          bass:
            item.bassNote
            ||
            chord.bass,

          notes:
            chord.notes,

          voicing:
            chord.voicing,

          confidence:
            item.confidence
            ??
            null

        };

      }
    )
    .filter(Boolean);

}


/* =========================================
   ACORDE NO TEMPO
========================================= */

export function getChordAtTime(
  timeline,
  time
){

  if(
    !Array.isArray(timeline)
  ){

    return null;

  }


  const seconds =
    Number(time);


  if(
    !Number.isFinite(seconds)
  ){

    return null;

  }


  return (
    timeline.find(
      item =>
        seconds >=
        item.start
        &&
        seconds <
        item.end
    )
    ||
    null
  );

}


/* =========================================
   LISTA DE NOTAS
========================================= */

export function getNoteNames(){

  return [
    ...NOTES
  ];

}
