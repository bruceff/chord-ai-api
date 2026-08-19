/* =========================================
   CHORD AI — CHORD ENGINE v2.2

   Responsável por:

   - entender símbolos de acordes
   - converter acorde -> notas
   - detectar acorde a partir de notas
   - criar timeline harmônica
   - estabilizar mudanças de acordes
   - transpor acordes
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

   Intervalos em semitons
========================================= */

const CHORD_TYPES = {

  /* MAIOR */

  "":
    [0,4,7],

  "MAJ":
    [0,4,7],


  /* MENOR */

  "MIN":
    [0,3,7],


  /* SÉTIMAS */

  "MIN7":
    [0,3,7,10],

  "7":
    [0,4,7,10],

  "MAJ7":
    [0,4,7,11],

  "MINMAJ7":
    [0,3,7,11],


  /* SEXTAS */

  "6":
    [0,4,7,9],

  "MIN6":
    [0,3,7,9],


  /* NONAS */

  "9":
    [0,4,7,10,14],

  "MAJ9":
    [0,4,7,11,14],

  "MIN9":
    [0,3,7,10,14],


  /* DÉCIMA PRIMEIRA */

  "11":
    [0,4,7,10,14,17],

  "MIN11":
    [0,3,7,10,14,17],


  /* DÉCIMA TERCEIRA */

  "13":
    [0,4,7,10,14,17,21],

  "MIN13":
    [0,3,7,10,14,17,21],


  /* SUSPENSOS */

  "SUS2":
    [0,2,7],

  "SUS4":
    [0,5,7],

  "7SUS4":
    [0,5,7,10],


  /* DIMINUTOS */

  "DIM":
    [0,3,6],

  "DIM7":
    [0,3,6,9],

  "MIN7B5":
    [0,3,6,10],


  /* AUMENTADO */

  "AUG":
    [0,4,8],


  /* ADICIONADOS */

  "ADD9":
    [0,4,7,14],

  "MINADD9":
    [0,3,7,14],


  /* ALTERADOS */

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
      .toUpperCase();


  value =
    value.replace(
      "♯",
      "#"
    );


  value =
    value.replace(
      "♭",
      "B"
    );


  if(
    ENHARMONIC[value]
  ){

    value =
      ENHARMONIC[value];

  }


  if(
    NOTES.includes(
      value
    )
  ){

    return value;

  }


  return null;

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
   NORMALIZAR QUALIDADE
========================================= */

function normalizeQuality(
  quality
){

  if(
    quality == null
  ){

    return "";

  }


  let value =
    String(quality)
      .trim();


  if(
    value === ""
  ){

    return "";

  }


  value =
    value
      .replace(/major/gi,"maj")
      .replace(/minor/gi,"min")
      .replace(/Δ/g,"maj")
      .replace(/ø/g,"m7b5")
      .replace(/°/g,"dim");


  /*
    IMPORTANTE:

    Precisamos distinguir:

    m
    M
    maj

    Portanto tratamos "m"
    antes de upperCase.
  */


  if(
    /^m$/i.test(value)
  ){

    return "MIN";

  }


  if(
    /^min$/i.test(value)
  ){

    return "MIN";

  }


  if(
    /^m7$/i.test(value)
  ){

    return "MIN7";

  }


  if(
    /^min7$/i.test(value)
  ){

    return "MIN7";

  }


  if(
    /^m6$/i.test(value)
  ){

    return "MIN6";

  }


  if(
    /^m9$/i.test(value)
  ){

    return "MIN9";

  }


  if(
    /^m11$/i.test(value)
  ){

    return "MIN11";

  }


  if(
    /^m13$/i.test(value)
  ){

    return "MIN13";

  }


  if(
    /^mmaj7$/i.test(value)
  ){

    return "MINMAJ7";

  }


  if(
    /^m7b5$/i.test(value)
  ){

    return "MIN7B5";

  }


  if(
    /^madd9$/i.test(value)
  ){

    return "MINADD9";

  }


  if(
    /^maj$/i.test(value)
  ){

    return "";

  }


  if(
    /^M$/.test(value)
  ){

    return "";

  }


  if(
    value === "+"
  ){

    return "AUG";

  }


  return value
    .toUpperCase();

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

    "MIN7":
      "m7",

    "7":
      "7",

    "MAJ7":
      "maj7",

    "MINMAJ7":
      "mMaj7",

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

    "11":
      "11",

    "MIN11":
      "m11",

    "13":
      "13",

    "MIN13":
      "m13",

    "SUS2":
      "sus2",

    "SUS4":
      "sus4",

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

    "7SUS4":
      "7sus4",

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
   PARSE DO ACORDE
========================================= */

function parseChordSymbol(
  symbol
){

  if(
    typeof symbol !==
    "string"
  ){

    return null;

  }


  let value =
    symbol
      .trim()
      .replace(
        /\s+/g,
        ""
      );


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
        match[2] || ""
      )
    );


  if(!root)
    return null;


  const quality =
    normalizeQuality(
      match[3] || ""
    );


  const bass =
    bassPart
    ?
    normalizeNote(
      bassPart
    )
    :
    null;


  return {

    original:
      symbol,

    root,

    quality,

    bass

  };

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

      root:
        parsed.root,

      quality:
        parsed.quality,

      error:
        "Tipo de acorde ainda não suportado"

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


  /*
    Inversão explícita no símbolo.

    Ex:
    C/E

    Aqui podemos usar porque o usuário
    realmente informou o baixo.
  */

  if(
    parsed.bass
  ){

    voicing =
      [

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


  const chord =
    analyzeChord(
      symbol
    );


  if(!chord.valid)
    return null;


  const newRoot =
    transposeNote(
      parsed.root,
      semitones
    );


  const qualitySymbol =
    qualityToSymbol(
      parsed.quality
    );


  let result =
    newRoot
    +
    qualitySymbol;


  if(
    parsed.bass
  ){

    const newBass =
      transposeNote(
        parsed.bass,
        semitones
      );


    result +=
      "/"
      +
      newBass;

  }


  return result;

}


/* =========================================
   COMPLEXIDADE DO ACORDE

   Usada pelo detector.

   Em caso de empate, acordes simples
   ganham ligeira preferência.

   Mas acordes complexos continuam
   podendo vencer quando há evidência.
========================================= */

function chordComplexityPenalty(
  intervals
){

  if(
    !Array.isArray(
      intervals
    )
  ){

    return 0;

  }


  const size =
    [
      ...new Set(
        intervals.map(
          value =>
            value % 12
        )
      )
    ].length;


  if(
    size <= 3
  ){

    return 0;

  }


  return (
    size - 3
  )
  *
  0.025;

}


/* =========================================
   DETECTAR ACORDE A PARTIR DE NOTAS
========================================= */

export function detectChord(
  inputNotes
){

  if(
    !Array.isArray(
      inputNotes
    )
    ||
    inputNotes.length < 2
  ){

    return {

      valid:false,

      error:
        "Notas insuficientes"

    };

  }


  const normalized =
    inputNotes
      .map(
        normalizeNote
      )
      .filter(Boolean);


  if(
    normalized.length < 2
  ){

    return {

      valid:false,

      error:
        "Notas inválidas"

    };

  }


  const unique =
    [
      ...new Set(
        normalized
      )
    ];


  const inputIndexes =
    unique.map(
      noteIndex
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

      /*
        Não temos mais aliases duplicados
        de maior/menor no CHORD_TYPES.

        Portanto MIN participa normalmente.
      */


      const expected =
        [
          ...new Set(
            intervals.map(
              interval =>
                (
                  rootIndex
                  +
                  interval
                ) % 12
            )
          )
        ];


      const matched =
        expected.filter(
          pitch =>
            inputIndexes.includes(
              pitch
            )
        );


      const missing =
        expected.filter(
          pitch =>
            !inputIndexes.includes(
              pitch
            )
        );


      const extra =
        inputIndexes.filter(
          pitch =>
            !expected.includes(
              pitch
            )
        );


      const coverage =
        matched.length
        /
        expected.length;


      const precision =
        matched.length
        /
        inputIndexes.length;


      let score =
        coverage * 0.62
        +
        precision * 0.38;


      /*
        Notas extras.
      */

      score -=
        extra.length
        *
        0.10;


      /*
        Notas faltando.
      */

      score -=
        missing.length
        *
        0.08;


      /*
        Pequena preferência por
        estruturas simples.
      */

      score -=
        chordComplexityPenalty(
          intervals
        );


      /*
        Bônus quando TODAS as notas
        detectadas pertencem ao acorde.
      */

      if(
        extra.length === 0
      ){

        score +=
          0.04;

      }


      /*
        Bônus para encaixe perfeito.
      */

      if(
        missing.length === 0
        &&
        extra.length === 0
      ){

        score +=
          0.08;

      }


      /*
        Fundamental detectada.

        Não significa que ela está no baixo.
        Apenas aumenta levemente a chance
        desse acorde.
      */

      if(
        inputIndexes.includes(
          rootIndex
        )
      ){

        score +=
          0.025;

      }


      candidates.push({

        root:
          NOTES[rootIndex],

        rootIndex,

        quality,

        intervals,

        expected,

        matched,

        missing,

        extra,

        score

      });

    }

  }


  candidates.sort(
    (a,b) =>
      b.score
      -
      a.score
  );


  const best =
    candidates[0];


  if(
    !best
    ||
    best.score <
    0.42
  ){

    return {

      valid:false,

      error:
        "Nenhum acorde confiável encontrado"

    };

  }


  const symbol =
    best.root
    +
    qualityToSymbol(
      best.quality
    );


  /*
    IMPORTANTE:

    Chroma NÃO informa baixo.

    Portanto não usamos:
    normalized[0]

    e não inventamos:
    C/E
    G/B
    F/A

    Um detector específico de baixo
    será adicionado depois.
  */

  const bass =
    null;


  const confidence =
    Math.max(
      0,
      Math.min(
        1,
        Number(
          best.score
            .toFixed(3)
        )
      )
    );


  return {

    valid:true,

    chord:
      symbol,

    root:
      best.root,

    quality:
      best.quality,

    bass:
      null,

    notes:
      unique,

    expectedNotes:
      best.expected.map(
        index =>
          NOTES[index]
      ),

    matchedNotes:
      best.matched.map(
        index =>
          NOTES[index]
      ),

    missingNotes:
      best.missing.map(
        index =>
          NOTES[index]
      ),

    extraNotes:
      best.extra.map(
        index =>
          NOTES[index]
      ),

    confidence,

    alternatives:
      candidates
        .slice(
          1,
          5
        )
        .map(
          item => ({

            chord:
              item.root
              +
              qualityToSymbol(
                item.quality
              ),

            confidence:
              Math.max(
                0,
                Math.min(
                  1,
                  Number(
                    item.score
                      .toFixed(3)
                  )
                )
              )

          })
        )

  };

}


/* =========================================
   NORMALIZAR TIMELINE EXISTENTE
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

        const chord =
          analyzeChord(
            item.chord
          );


        if(
          !chord.valid
        ){

          return null;

        }


        const start =
          Number(
            item.start
          );


        const end =
          Number(
            item.end
          );


        if(
          !Number.isFinite(start)
          ||
          !Number.isFinite(end)
          ||
          end <= start
        ){

          return null;

        }


        return {

          index,

          start,

          end,

          chord:
            item.chord,

          root:
            chord.root,

          bass:
            chord.bass,

          notes:
            chord.notes,

          voicing:
            chord.voicing,

          confidence:
            typeof item.confidence ===
            "number"
            ?
            item.confidence
            :
            null

        };

      }
    )
    .filter(Boolean)
    .sort(
      (a,b) =>
        a.start
        -
        b.start
    );

}


/* =========================================
   ACORDE EM UM DETERMINADO TEMPO
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
   DETECTAR TIMELINE DE ACORDES
========================================= */

export function detectChordTimeline(
  frames
){

  if(
    !Array.isArray(
      frames
    )
    ||
    frames.length === 0
  ){

    return [];

  }


  const normalizedFrames =
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


          const detection =
            detectChord(
              frame.notes
            );


          return {

            time,

            detection

          };

        }
      )
      .filter(Boolean)
      .sort(
        (a,b) =>
          a.time
          -
          b.time
      );


  if(
    normalizedFrames.length === 0
  ){

    return [];

  }


  const rawSegments = [];


  /*
    Estima o tamanho do último frame
    usando a distância temporal média.
  */

  let defaultStep = 1;


  if(
    normalizedFrames.length >= 2
  ){

    const diffs = [];


    for(
      let i = 1;
      i < normalizedFrames.length;
      i++
    ){

      const diff =
        normalizedFrames[i].time
        -
        normalizedFrames[i - 1].time;


      if(
        diff > 0
      ){

        diffs.push(
          diff
        );

      }

    }


    if(
      diffs.length > 0
    ){

      defaultStep =
        diffs.reduce(
          (sum,value) =>
            sum + value,
          0
        )
        /
        diffs.length;

    }

  }


  for(
    let i = 0;
    i < normalizedFrames.length;
    i++
  ){

    const current =
      normalizedFrames[i];


    const next =
      normalizedFrames[
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


    const detection =
      current.detection;


    rawSegments.push({

      start,

      end,

      chord:
        detection.valid
        ?
        detection.chord
        :
        "N",

      notes:
        detection.valid
        ?
        detection.expectedNotes
        :
        [],

      confidence:
        detection.valid
        ?
        detection.confidence
        :
        0

    });

  }


  /*
    Junta frames consecutivos
    que já têm o mesmo acorde.
  */

  const merged = [];


  for(
    const segment
    of rawSegments
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

      const previousDuration =
        previous.end
        -
        previous.start;


      const currentDuration =
        segment.end
        -
        segment.start;


      previous.end =
        segment.end;


      const totalDuration =
        previousDuration
        +
        currentDuration;


      if(
        totalDuration > 0
      ){

        previous.confidence =
          Number(
            (
              (
                (
                  previous.confidence || 0
                )
                *
                previousDuration
              )
              +
              (
                (
                  segment.confidence || 0
                )
                *
                currentDuration
              )
            )
            /
            totalDuration
          )
          .toFixed(3);

      }

    }

    else{

      merged.push({
        ...segment
      });

    }

  }


  return merged;

}


/* =========================================
   ESTABILIZAR TIMELINE
========================================= */

export function stabilizeChordTimeline(
  timeline,
  options = {}
){

  if(
    !Array.isArray(
      timeline
    )
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
    0.55;


  const mergeGap =
    Number.isFinite(
      Number(
        options.mergeGap
      )
    )
    ?
    Number(
      options.mergeGap
    )
    :
    0.20;


  const confidenceThreshold =
    Number.isFinite(
      Number(
        options.confidenceThreshold
      )
    )
    ?
    Number(
      options.confidenceThreshold
    )
    :
    0.48;


  let segments =
    timeline
      .map(
        item => ({
          ...item
        })
      )
      .filter(
        item =>
          Number.isFinite(
            item.start
          )
          &&
          Number.isFinite(
            item.end
          )
          &&
          item.end >
          item.start
      )
      .sort(
        (a,b) =>
          a.start
          -
          b.start
      );


  if(
    segments.length === 0
  ){

    return [];

  }


  /* =====================================
     1. BAIXA CONFIANÇA -> N
  ===================================== */

  segments =
    segments.map(
      segment => {

        if(
          segment.chord !== "N"
          &&
          Number.isFinite(
            segment.confidence
          )
          &&
          segment.confidence <
          confidenceThreshold
        ){

          return {

            ...segment,

            chord:
              "N",

            notes:
              []

          };

        }


        return segment;

      }
    );


  /* =====================================
     2. BURACO CURTO ENTRE ACORDES IGUAIS
  ===================================== */

  for(
    let i = 1;
    i < segments.length - 1;
    i++
  ){

    const previous =
      segments[i - 1];

    const current =
      segments[i];

    const next =
      segments[i + 1];


    const duration =
      current.end
      -
      current.start;


    if(
      duration <=
      minDuration
      &&
      previous.chord ===
      next.chord
      &&
      current.chord !==
      previous.chord
    ){

      current.chord =
        previous.chord;

      current.notes =
        previous.notes;

      current.confidence =
        Math.max(
          previous.confidence || 0,
          next.confidence || 0
        );

    }

  }


  /* =====================================
     3. MICROSEGMENTOS
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
      segments[i - 1]
      :
      null;


    const next =
      i <
      segments.length - 1
      ?
      segments[i + 1]
      :
      null;


    if(
      previous
      &&
      next
    ){

      /*
        Mesmos vizinhos.
      */

      if(
        previous.chord ===
        next.chord
      ){

        current.chord =
          previous.chord;

        current.notes =
          previous.notes;

        current.confidence =
          Math.max(
            previous.confidence || 0,
            next.confidence || 0
          );

        continue;

      }


      /*
        Caso contrário, usa o
        vizinho mais confiável.
      */

      const previousConfidence =
        previous.confidence
        ||
        0;


      const nextConfidence =
        next.confidence
        ||
        0;


      if(
        previousConfidence >=
        nextConfidence
      ){

        current.chord =
          previous.chord;

        current.notes =
          previous.notes;

        current.confidence =
          previousConfidence;

      }

      else{

        current.chord =
          next.chord;

        current.notes =
          next.notes;

        current.confidence =
          nextConfidence;

      }

    }

    else if(previous){

      current.chord =
        previous.chord;

      current.notes =
        previous.notes;

      current.confidence =
        previous.confidence;

    }

    else if(next){

      current.chord =
        next.chord;

      current.notes =
        next.notes;

      current.confidence =
        next.confidence;

    }

  }


  /* =====================================
     4. PRIMEIRO MERGE
  ===================================== */

  let merged = [];


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
      &&
      (
        segment.start
        -
        previous.end
      )
      <= mergeGap
    ){

      const previousDuration =
        previous.end
        -
        previous.start;


      const currentDuration =
        segment.end
        -
        segment.start;


      const totalDuration =
        previousDuration
        +
        currentDuration;


      previous.end =
        segment.end;


      if(
        totalDuration > 0
      ){

        previous.confidence =
          Number(
            (
              (
                (
                  previous.confidence || 0
                )
                *
                previousDuration
              )
              +
              (
                (
                  segment.confidence || 0
                )
                *
                currentDuration
              )
            )
            /
            totalDuration
          )
          .toFixed(3);

      }


      continue;

    }


    merged.push({
      ...segment
    });

  }


  /* =====================================
     5. REMOVER MICROSEGMENTOS
        QUE SURGIRAM APÓS MERGE
  ===================================== */

  let changed = true;

  let safety = 0;


  while(
    changed
    &&
    safety < 10
  ){

    changed = false;

    safety++;


    for(
      let i = 0;
      i < merged.length;
      i++
    ){

      const current =
        merged[i];


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
        merged[i - 1]
        :
        null;


      const next =
        i <
        merged.length - 1
        ?
        merged[i + 1]
        :
        null;


      /*
        Entre dois acordes iguais.
      */

      if(
        previous
        &&
        next
        &&
        previous.chord ===
        next.chord
      ){

        previous.end =
          next.end;


        merged.splice(
          i,
          2
        );


        changed = true;

        break;

      }


      /*
        Escolhe o vizinho mais confiável.
      */

      if(
        previous
        &&
        next
      ){

        const usePrevious =
          (
            previous.confidence || 0
          )
          >=
          (
            next.confidence || 0
          );


        if(usePrevious){

          previous.end =
            current.end;

          merged.splice(
            i,
            1
          );

        }

        else{

          next.start =
            current.start;

          merged.splice(
            i,
            1
          );

        }


        changed = true;

        break;

      }


      if(previous){

        previous.end =
          current.end;


        merged.splice(
          i,
          1
        );


        changed = true;

        break;

      }


      if(next){

        next.start =
          current.start;


        merged.splice(
          i,
          1
        );


        changed = true;

        break;

      }

    }

  }


  /* =====================================
     6. MERGE FINAL
  ===================================== */

  const finalTimeline = [];


  for(
    const segment
    of merged
  ){

    const previous =
      finalTimeline[
        finalTimeline.length - 1
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


    finalTimeline.push({
      ...segment
    });

  }


  return finalTimeline;

}


/* =========================================
   EXPORTAR LISTA DE NOTAS
========================================= */

export function getNoteNames(){

  return [
    ...NOTES
  ];

}
