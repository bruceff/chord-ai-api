/* =========================================
   CHORD AI — CHORD ENGINE v6

   Principais mudanças:

   - usa chroma completo
   - usa bassNote
   - usa bassChroma
   - root-aware scoring
   - diferencia melhor:
       Am7 vs C6
       G7 vs Bdim
       E7 vs G#dim
       Dm7 vs F
   - mantém decoder temporal
   - mantém estabilização
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

  "DB": "C#",
  "EB": "D#",
  "GB": "F#",
  "AB": "G#",
  "BB": "A#",

  "CB": "B",
  "FB": "E",

  "E#": "F",
  "B#": "C"

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


/* =========================================
   NORMALIZAR NOTA
========================================= */

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


/* =========================================
   ÍNDICE DA NOTA
========================================= */

function noteIndex(
  note
){

  const normalized =
    normalizeNote(
      note
    );


  if(!normalized)
    return -1;


  return NOTES.indexOf(
    normalized
  );

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


  return value
    .toUpperCase();

}


/* =========================================
   PARSE DO ACORDE
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


  const slashParts =
    value.split("/");


  const chordPart =
    slashParts[0];


  const bassPart =
    slashParts[1]
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
    noteIndex(
      note
    );


  if(index < 0)
    return null;


  let next =
    (
      index
      +
      Number(
        semitones
      )
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
   QUALIDADES
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


function isSeventhQuality(
  quality
){

  return [

    "7",
    "MIN7",
    "MAJ7",

    "DIM7",
    "MIN7B5",

    "7SUS4",

    "7B5",
    "7#5"

  ].includes(
    quality
  );

}


/* =========================================
   DISTÂNCIA ENTRE NOTAS
========================================= */

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


/* =========================================
   SCORE DO BAIXO
========================================= */

function scoreBassForChord(
  rootIndex,
  pitches,
  bassNote,
  bassChroma,
  options = {}
){

  const bassWeight =
    Number.isFinite(
      Number(
        options.bassWeight
      )
    )
    ?
    Number(
      options.bassWeight
    )
    :
    0.34;


  let score = 0;


  const bassIndex =
    noteIndex(
      bassNote
    );


  const normalizedBass =
    normalizeChroma(
      bassChroma
    );


  /* =====================================
     BASS NOTE EXPLÍCITO
  ===================================== */

  if(
    bassIndex >= 0
  ){

    /*
      Forte bônus se baixo = fundamental.
    */

    if(
      bassIndex ===
      rootIndex
    ){

      score +=
        bassWeight;

    }


    /*
      Se baixo pertence ao acorde
      mas não é fundamental,
      pode ser inversão.
    */

    else if(
      pitches.includes(
        bassIndex
      )
    ){

      score +=
        bassWeight
        *
        0.16;

    }


    /*
      Se baixo nem pertence ao acorde,
      grande penalidade.
    */

    else{

      score -=
        bassWeight
        *
        0.55;

    }


    /*
      Penalidade adicional conforme
      distância da fundamental.
    */

    const distance =
      pitchDistance(
        bassIndex,
        rootIndex
      );


    if(
      bassIndex !== rootIndex
      &&
      !pitches.includes(
        bassIndex
      )
    ){

      score -=
        distance
        *
        0.008;

    }

  }


  /* =====================================
     BASS CHROMA
  ===================================== */

  if(
    normalizedBass
  ){

    const rootBassEnergy =
      normalizedBass[
        rootIndex
      ];


    score +=
      rootBassEnergy
      *
      bassWeight
      *
      0.55;


    /*
      Energia grave nas demais
      notas estruturais.
    */

    let structuralBassEnergy = 0;


    for(
      const pitch
      of pitches
    ){

      structuralBassEnergy +=
        normalizedBass[
          pitch
        ];

    }


    structuralBassEnergy /=
      pitches.length;


    score +=
      structuralBassEnergy
      *
      bassWeight
      *
      0.08;

  }


  return score;

}


/* =========================================
   SCORE DO TEMPLATE
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


  const pitchSet =
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
      !pitchSet.has(i)
    ){

      outsideEnergy +=
        chroma[i];

    }

  }


  const totalEnergy =
    insideEnergy
    +
    outsideEnergy
    +
    1e-9;


  const explainedRatio =
    insideEnergy
    /
    totalEnergy;


  const averageInside =
    insideEnergy
    /
    structural.length;


  const rootEnergy =
    chroma[
      rootIndex
    ];


  const weakestStructural =
    Math.min(
      ...structural
    );


  const strongestStructural =
    Math.max(
      ...structural
    );


  let score =
    0;


  /* =====================================
     CHROMA SCORE
  ===================================== */

  score +=
    averageInside
    *
    0.40;


  score +=
    explainedRatio
    *
    0.30;


  score +=
    rootEnergy
    *
    0.12;


  score +=
    weakestStructural
    *
    0.08;


  /* =====================================
     ROOT PRESENTE
  ===================================== */

  if(
    rootEnergy >= 0.50
  ){

    score +=
      0.055;

  }


  if(
    rootEnergy >= 0.72
  ){

    score +=
      0.04;

  }


  /* =====================================
     ROOT MUITO FRACA
  ===================================== */

  if(
    rootEnergy < 0.16
  ){

    score -=
      0.075;

  }


  if(
    rootEnergy < 0.08
  ){

    score -=
      0.055;

  }


  /* =====================================
     ENERGIA FORA DO ACORDE
  ===================================== */

  score -=
    (
      outsideEnergy
      /
      12
    )
    *
    0.15;


  /* =====================================
     NOTAS ESTRUTURAIS FRACAS
  ===================================== */

  const weakCount =
    structural.filter(
      energy =>
        energy < 0.16
    ).length;


  score -=
    weakCount
    *
    0.055;


  /* =====================================
     TÉTRADES
  ===================================== */

  if(
    pitches.length === 4
  ){

    const fourthEnergy =
      structural[3];


    if(
      fourthEnergy >= 0.34
    ){

      score +=
        0.055;

    }


    if(
      fourthEnergy >= 0.52
    ){

      score +=
        0.035;

    }

  }


  /* =====================================
     TRÍADES COMO SUBCONJUNTO

     Se há uma nota forte fora,
     evitamos escolher uma tríade
     que ignora uma 7ª real.
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
        !pitchSet.has(i)
        &&
        chroma[i] >= 0.43
      ){

        strongOutside++;

      }

    }


    score -=
      strongOutside
      *
      0.075;

  }


  /* =====================================
     SÉTIMAS

     Pequena penalidade, mas muito
     menor que nas versões antigas.
  ===================================== */

  if(
    isSeventhQuality(
      quality
    )
  ){

    score -=
      0.008;

  }


  /* =====================================
     EXTENSÕES

     9/add9 só ganham se houver
     energia na extensão.
  ===================================== */

  if(
    isExtendedQuality(
      quality
    )
  ){

    const extensionPitches =
      pitches.slice(3);


    const extensionEnergy =
      extensionPitches.reduce(
        (sum,pitch) =>
          sum
          +
          chroma[pitch],
        0
      )
      /
      Math.max(
        1,
        extensionPitches.length
      );


    score -=
      0.028;


    if(
      extensionEnergy < 0.30
    ){

      score -=
        (
          0.30
          -
          extensionEnergy
        )
        *
        0.38;

    }


    if(
      extensionEnergy >= 0.55
    ){

      score +=
        0.025;

    }

  }


  /* =====================================
     BALANÇO INTERNO
  ===================================== */

  if(
    strongestStructural > 0
  ){

    const balance =
      weakestStructural
      /
      strongestStructural;


    if(
      balance < 0.14
    ){

      score -=
        0.04;

    }

  }


  /* =====================================
     NOVO NO V6:
     SCORE DO BAIXO
  ===================================== */

  score +=
    scoreBassForChord(
      rootIndex,
      pitches,
      context.bassNote,
      context.bassChroma,
      {

        bassWeight:
          context.bassWeight

      }
    );


  return {

    score,

    pitches,

    rootEnergy,

    insideEnergy,

    outsideEnergy,

    explainedRatio,

    weakestStructural

  };

}


/* =========================================
   CANDIDATOS POR CHROMA
========================================= */

export function detectChordCandidatesFromChroma(
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


  const total =
    normalized.reduce(
      (sum,value) =>
        sum + value,
      0
    );


  if(
    total <= 0.001
  ){

    return [];

  }


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

            bassNote:
              options.bassNote,

            bassChroma:
              options.bassChroma,

            bassWeight:
              options.bassWeight

          }
        );


      candidates.push({

        chord:
          NOTES[rootIndex]
          +
          qualityToSymbol(
            quality
          ),

        root:
          NOTES[rootIndex],

        rootIndex,

        quality,

        notes:
          result.pitches.map(
            pitch =>
              NOTES[pitch]
          ),

        score:
          result.score,

        explainedRatio:
          result.explainedRatio,

        rootEnergy:
          result.rootEnergy,

        bassNote:
          options.bassNote
          ||
          null

      });

    }

  }


  candidates.sort(
    (a,b) =>
      b.score
      -
      a.score
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
   DETECTAR ACORDE POR CHROMA
========================================= */

export function detectChordFromChroma(
  chroma,
  options = {}
){

  const candidates =
    detectChordCandidatesFromChroma(
      chroma,
      {

        limit:
          5,

        bassNote:
          options.bassNote,

        bassChroma:
          options.bassChroma,

        bassWeight:
          options.bassWeight

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


  const minScore =
    Number.isFinite(
      Number(
        options.minScore
      )
    )
    ?
    Number(
      options.minScore
    )
    :
    0.30;


  if(
    best.score <
    minScore
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
      candidates.slice(
        1
      )

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
   DECODER TEMPORAL — V6
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


  const bassWeight =
    Number.isFinite(
      Number(
        options.bassWeight
      )
    )
    ?
    Number(
      options.bassWeight
    )
    :
    0.34;


  const validFrames =
    frames
      .map(
        frame => {

          const time =
            Number(
              frame.time
            );


          if(
            !Number.isFinite(
              time
            )
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
                  frame.bassChroma,

                bassWeight

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

    chord:
      "N",

    candidate:
      null,

    score:
      0.025,

    previous:
      null

  });


  dp.push(
    firstStates
  );


  /* =====================================
     DEMAIS FRAMES
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
        0.02;


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


        let transition =
          0;


        /* =================================
           CONTINUAR MESMO ACORDE
        ================================= */

        if(
          previous.chord ===
          chord
        ){

          transition +=
            stayBonus;

        }


        /* =================================
           TROCAR ACORDE
        ================================= */

        else{

          transition -=
            changePenalty;


          /*
            Entrar/sair de N custa menos.
          */

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


        /* =================================
           EXTENSÕES
        ================================= */

        if(
          candidate
          &&
          isExtendedQuality(
            candidate.quality
          )
          &&
          previous.chord !==
          chord
        ){

          transition -=
            0.025;

        }


        /* =================================
           TROCA DE ROOT COM MESMO BAIXO

           Se o baixo continua igual,
           evitamos mudar root sem
           evidência forte.
        ================================= */

        if(
          candidate
          &&
          validFrames[t].bassNote
          &&
          previous.candidate
        ){

          const bass =
            validFrames[t]
              .bassNote;


          if(
            bass ===
            previous.candidate.root
            &&
            candidate.root !==
            bass
          ){

            transition -=
              0.05;

          }

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


  let bestLastIndex =
    0;


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
        validFrames[t].bassNote
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


    if(
      diff > 0
    ){

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

      const oldDuration =
        previous.end
        -
        previous.start;


      const newDuration =
        end
        -
        start;


      const total =
        oldDuration
        +
        newDuration;


      previous.confidence =
        total > 0
        ?
        Number(
          (
            (
              previous.confidence
              *
              oldDuration
            )
            +
            (
              current.confidence
              *
              newDuration
            )
          )
          /
          total
        )
        .toFixed(3)
        :
        previous.confidence;


      previous.end =
        end;


      /*
        Atualiza baixo se antes
        estava ausente.
      */

      if(
        !previous.bassNote
        &&
        current.bassNote
      ){

        previous.bassNote =
          current.bassNote;

      }

    }

    else{

      timeline.push({

        start,

        end,

        chord:
          current.chord,

        notes:
          current.notes,

        bassNote:
          current.bassNote
          ||
          null,

        confidence:
          current.confidence

      });

    }

  }


  return timeline;

}


/* =========================================
   PIPELINE CHROMA + BASS
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
   TIMELINE LEGADA POR NOTAS
========================================= */

export function detectChordTimeline(
  frames
){

  if(
    !Array.isArray(
      frames
    )
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

              chroma[index] =
                1;

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
   ESTABILIZADOR FINAL
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


  /* =====================================
     MICROSEGMENTOS
  ===================================== */

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


  /* =====================================
     MERGE FINAL
  ===================================== */

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


      if(
        !previous.bassNote
        &&
        segment.bassNote
      ){

        previous.bassNote =
          segment.bassNote;

      }


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
    !Array.isArray(
      chords
    )
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


        if(
          !chord.valid
        ){

          return null;

        }


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
    !Array.isArray(
      timeline
    )
  ){

    return null;

  }


  const seconds =
    Number(
      time
    );


  if(
    !Number.isFinite(
      seconds
    )
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
