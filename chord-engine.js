/* =========================================
   CHORD AI — MUSIC ENGINE
   Núcleo de teoria musical
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

   Valores = intervalos em semitons
========================================= */

const CHORD_TYPES = {

  "": [0,4,7],

  "M": [0,4,7],

  "MAJ": [0,4,7],

  "MIN": [0,3,7],

  "M7": [0,3,7,10],

  "MIN7": [0,3,7,10],

  "7": [0,4,7,10],

  "MAJ7": [0,4,7,11],

  "MMAJ7": [0,3,7,11],

  "6": [0,4,7,9],

  "M6": [0,3,7,9],

  "9": [0,4,7,10,14],

  "MAJ9": [0,4,7,11,14],

  "M9": [0,3,7,10,14],

  "11": [0,4,7,10,14,17],

  "M11": [0,3,7,10,14,17],

  "13": [0,4,7,10,14,17,21],

  "M13": [0,3,7,10,14,17,21],

  "SUS2": [0,2,7],

  "SUS4": [0,5,7],

  "DIM": [0,3,6],

  "DIM7": [0,3,6,9],

  "M7B5": [0,3,6,10],

  "AUG": [0,4,8],

  "+": [0,4,8],

  "ADD9": [0,4,7,14],

  "MADD9": [0,3,7,14],

  "7SUS4": [0,5,7,10],

  "7B5": [0,4,6,10],

  "7#5": [0,4,8,10],

  "7B9": [0,4,7,10,13],

  "7#9": [0,4,7,10,15],

  "MAJ7#11": [0,4,7,11,18]

};


/* =========================================
   NORMALIZAR NOTA
========================================= */

function normalizeNote(note){

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
    NOTES.includes(value)
  ){

    return value;

  }


  return null;

}


/* =========================================
   ÍNDICE DA NOTA
========================================= */

function noteIndex(note){

  const normalized =
    normalizeNote(note);


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
    noteIndex(note);


  if(index < 0)
    return null;


  let next =
    (
      index +
      semitones
    ) % 12;


  if(next < 0)
    next += 12;


  return NOTES[next];

}


/* =========================================
   EXTRAIR PARTES DO ACORDE
========================================= */

function parseChordSymbol(symbol){

  if(
    typeof symbol !== "string"
  ){

    return null;

  }


  let value =
    symbol
      .trim()
      .replace(/\s+/g,"");


  if(!value)
    return null;


  /*
    Exemplo:

    Cmaj7/E

    chordPart = Cmaj7
    bassPart  = E
  */

  const slashParts =
    value.split("/");


  const chordPart =
    slashParts[0];


  const bassPart =
    slashParts[1] || null;


  /*
    Captura fundamental:

    C
    C#
    Db
  */

  const match =
    chordPart.match(
      /^([A-Ga-g])([#b♯♭]?)(.*)$/
    );


  if(!match)
    return null;


  let root =
    match[1]
    +
    (
      match[2] || ""
    );


  root =
    normalizeNote(root);


  if(!root)
    return null;


  let quality =
    (
      match[3] || ""
    )
    .trim();


  /*
    Normalizações
  */

  quality =
    quality
      .replace(/minor/gi,"m")
      .replace(/min/gi,"m")
      .replace(/major/gi,"maj")
      .replace(/Δ/gi,"maj")
      .replace(/ø/gi,"m7b5");


  quality =
    quality.toUpperCase();


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
   PEGAR INTERVALOS
========================================= */

function getIntervals(
  quality
){

  /*
    Acorde simples maior
  */

  if(
    quality === ""
  ){

    return CHORD_TYPES[""];

  }


  /*
    Caso "m"
  */

  if(
    quality === "M"
  ){

    /*
      Atenção:
      depois de upperCase,
      "m" vira "M".

      Neste parser consideramos M
      vindo de "m" como menor.
    */

    return [
      0,3,7
    ];

  }


  /*
    aliases mais comuns
  */

  const aliases = {

    "MIN":
      "MIN",

    "MIN7":
      "MIN7",

    "M7":
      "M7",

    "MAJOR7":
      "MAJ7",

    "MINOR7":
      "MIN7",

    "°":
      "DIM",

    "°7":
      "DIM7"

  };


  const key =
    aliases[quality]
    ||
    quality;


  return (
    CHORD_TYPES[key]
    ||
    null
  );

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

      chord:symbol,

      error:
        "Acorde inválido"

    };

  }


  const intervals =
    getIntervals(
      parsed.quality
    );


  if(!intervals){

    return {

      valid:false,

      chord:symbol,

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
                rootIndex +
                interval
              ) % 12
            ]
        )

      )
    ];


  /*
    Caso exista inversão,
    coloca o baixo primeiro
  */

  let voicing =
    [...notes];


  if(parsed.bass){

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

  const chord =
    analyzeChord(
      symbol
    );


  if(!chord.valid)
    return null;


  const newRoot =
    transposeNote(
      chord.root,
      semitones
    );


  const newBass =
    chord.bass
    ?
    transposeNote(
      chord.bass,
      semitones
    )
    :
    null;


  const parsed =
    parseChordSymbol(
      symbol
    );


  let result =
    newRoot
    +
    (
      parsed.quality
        .toLowerCase()
    );


  if(
    parsed.bass
  ){

    result +=
      "/" +
      newBass;

  }


  return result;

}


/* =========================================
   CRIAR TIMELINE
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
        a.start -
        b.start
    );

}


/* =========================================
   ACORDE EM DETERMINADO TEMPO
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
        seconds >= item.start
        &&
        seconds < item.end
    )
    ||
    null
  );

}
/* =========================================
   DETECTAR ACORDE A PARTIR DE NOTAS
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
      error:"Notas insuficientes"
    };

  }


  const normalized =
    inputNotes
      .map(normalizeNote)
      .filter(Boolean);


  if(
    normalized.length < 2
  ){

    return {
      valid:false,
      error:"Notas inválidas"
    };

  }


  const unique =
    [...new Set(normalized)];


  const inputIndexes =
    unique
      .map(noteIndex);


  const candidates = [];


  for(
    let rootIndex = 0;
    rootIndex < NOTES.length;
    rootIndex++
  ){

    for(
      const [
        quality,
        intervals
      ]
      of Object.entries(
        CHORD_TYPES
      )
    ){

      /*
        Evita aliases duplicados
      */

      if(
        [
          "M",
          "MAJ",
          "MIN",
          "+"
        ].includes(quality)
      ){

        continue;

      }


      const expected =
        [
          ...new Set(
            intervals.map(
              interval =>
                (
                  rootIndex +
                  interval
                ) % 12
            )
          )
        ];


      const matched =
        expected.filter(
          pc =>
            inputIndexes.includes(pc)
        );


      const missing =
        expected.filter(
          pc =>
            !inputIndexes.includes(pc)
        );


      const extra =
        inputIndexes.filter(
          pc =>
            !expected.includes(pc)
        );


      const coverage =
        matched.length /
        expected.length;


      const precision =
        matched.length /
        inputIndexes.length;


      /*
        Score básico
      */

      let score =
        coverage * 0.62
        +
        precision * 0.38;


      /*
        Penaliza notas extras
      */

      score -=
        extra.length * 0.08;


      /*
        Penaliza notas faltando
      */

      score -=
        missing.length * 0.06;


      /*
        Favorece acordes mais simples
        quando dois resultados forem
        muito parecidos
      */

      score -=
        Math.max(
          0,
          expected.length - 4
        )
        *
        0.015;


      candidates.push({

        root:
          NOTES[rootIndex],

        quality,

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
      b.score -
      a.score
  );


  const best =
    candidates[0];


  if(
    !best
    ||
    best.score < 0.45
  ){

    return {
      valid:false,
      error:"Nenhum acorde confiável encontrado"
    };

  }


  let symbol =
    best.root
    +
    qualityToSymbol(
      best.quality
    );


  /*
    Primeira nota recebida = baixo
  */

  const bass =
    normalized[0];


  if(
    bass !== best.root
    &&
    best.expected.includes(
      noteIndex(bass)
    )
  ){

    symbol +=
      "/" + bass;

  }


  return {

    valid:true,

    chord:
      symbol,

    root:
      best.root,

    bass,

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

    confidence:
      Math.max(
        0,
        Math.min(
          1,
          Number(
            best.score.toFixed(3)
          )
        )
      ),

    alternatives:
      candidates
        .slice(1,5)
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
                    item.score.toFixed(3)
                  )
                )
              )

          })
        )

  };

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

    "M7":
      "m7",

    "MIN7":
      "m7",

    "7":
      "7",

    "MAJ7":
      "maj7",

    "MMAJ7":
      "mMaj7",

    "6":
      "6",

    "M6":
      "m6",

    "9":
      "9",

    "MAJ9":
      "maj9",

    "M9":
      "m9",

    "11":
      "11",

    "M11":
      "m11",

    "13":
      "13",

    "M13":
      "m13",

    "SUS2":
      "sus2",

    "SUS4":
      "sus4",

    "DIM":
      "dim",

    "DIM7":
      "dim7",

    "M7B5":
      "m7b5",

    "AUG":
      "aug",

    "ADD9":
      "add9",

    "MADD9":
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
   DETECTAR TIMELINE DE ACORDES
========================================= */

export function detectChordTimeline(
  frames
){

  if(
    !Array.isArray(frames)
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
            Number(frame.time);


          if(
            !Number.isFinite(time)
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
          a.time - b.time
      );


  if(
    normalizedFrames.length === 0
  ){
    return [];
  }


  const rawSegments = [];


  for(
    let i = 0;
    i < normalizedFrames.length;
    i++
  ){

    const current =
      normalizedFrames[i];

    const next =
      normalizedFrames[i + 1];

    const start =
      current.time;

    const end =
      next
      ? next.time
      : start + 1;

    const detection =
      current.detection;


    rawSegments.push({

      start,

      end,

      chord:
        detection.valid
        ? detection.chord
        : "N",

      notes:
        detection.valid
        ? detection.expectedNotes
        : [],

      confidence:
        detection.valid
        ? detection.confidence
        : 0

    });

  }


  /*
    Junta blocos consecutivos
    que possuem o mesmo acorde.
  */

  const merged = [];


  for(
    const segment of rawSegments
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
          (
            (
              previous.confidence
              +
              segment.confidence
            )
            / 2
          ).toFixed(3)
        );

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
   ESTABILIZAR TIMELINE DE ACORDES
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
      options.minDuration
    )
    ?
    options.minDuration
    :
    0.55;


  const mergeGap =
    Number.isFinite(
      options.mergeGap
    )
    ?
    options.mergeGap
    :
    0.20;


  const confidenceThreshold =
    Number.isFinite(
      options.confidenceThreshold
    )
    ?
    options.confidenceThreshold
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
          a.start -
          b.start
      );


  if(
    segments.length === 0
  ){
    return [];
  }


  /* =====================================
     1. REMOVER ACORDES DE BAIXA CONFIANÇA
  ===================================== */

  segments =
    segments.map(
      segment => {

        if(
          segment.confidence != null
          &&
          segment.confidence <
          confidenceThreshold
        ){

          return {
            ...segment,
            chord:"N"
          };

        }


        return segment;

      }
    );


  /* =====================================
     2. PREENCHER BURACOS ENTRE
        ACORDES IGUAIS
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
      current.end -
      current.start;


    if(
      previous.chord ===
      next.chord
      &&
      current.chord !==
      previous.chord
      &&
      duration <=
      minDuration
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
     3. ELIMINAR TROCAS MUITO CURTAS

     Se um acorde dura pouco,
     escolhemos o vizinho mais provável.
  ===================================== */

  for(
    let i = 0;
    i < segments.length;
    i++
  ){

    const current =
      segments[i];


    const duration =
      current.end -
      current.start;


    if(
      duration >= minDuration
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

      if(
        previous.chord ===
        next.chord
      ){

        current.chord =
          previous.chord;

        current.notes =
          previous.notes;

        continue;

      }


      const previousConfidence =
        previous.confidence || 0;


      const nextConfidence =
        next.confidence || 0;


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
     4. JUNTAR ACORDES IGUAIS
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
      &&
      (
        segment.start -
        previous.end
      )
      <= mergeGap
    ){

      previous.end =
        segment.end;


      const a =
        previous.confidence || 0;

      const b =
        segment.confidence || 0;


      previous.confidence =
        Number(
          (
            (a + b)
            /
            2
          )
          .toFixed(3)
        );


      continue;

    }


    merged.push({
      ...segment
    });

  }


  /* =====================================
     5. REMOVER "N" MUITO CURTO
  ===================================== */

  for(
    let i = 1;
    i < merged.length - 1;
    i++
  ){

    const current =
      merged[i];


    if(
      current.chord !== "N"
    ){
      continue;
    }


    const duration =
      current.end -
      current.start;


    if(
      duration >
      minDuration
    ){
      continue;
    }


    const previous =
      merged[i - 1];

    const next =
      merged[i + 1];


    if(
      previous.chord ===
      next.chord
    ){

      current.chord =
        previous.chord;

      current.notes =
        previous.notes;

      current.confidence =
        previous.confidence;

    }

  }


  /* =====================================
     6. JUNÇÃO FINAL
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

  return [...NOTES];

}
