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
   EXPORTAR LISTA DE NOTAS
========================================= */

export function getNoteNames(){

  return [...NOTES];

}
