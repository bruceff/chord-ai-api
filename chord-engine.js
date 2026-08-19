/* =========================================
   CHORD AI — CHORD ENGINE v3
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

  "": [0,4,7],

  "MIN": [0,3,7],

  "7": [0,4,7,10],

  "MIN7": [0,3,7,10],

  "MAJ7": [0,4,7,11],

  "6": [0,4,7,9],

  "MIN6": [0,3,7,9],

  "9": [0,4,7,10,14],

  "MAJ9": [0,4,7,11,14],

  "MIN9": [0,3,7,10,14],

  "SUS2": [0,2,7],

  "SUS4": [0,5,7],

  "DIM": [0,3,6],

  "DIM7": [0,3,6,9],

  "MIN7B5": [0,3,6,10],

  "AUG": [0,4,8],

  "ADD9": [0,4,7,14],

  "MINADD9": [0,3,7,14],

  "7SUS4": [0,5,7,10],

  "7B5": [0,4,6,10],

  "7#5": [0,4,8,10],

  "7B9": [0,4,7,10,13],

  "7#9": [0,4,7,10,15],

  "MAJ7#11": [0,4,7,11,18]

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
    normalizeNote(
      note
    );


  if(!normalized)
    return -1;


  return NOTES.indexOf(
    normalized
  );

}


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

          const n =
            Number(value);

          return (
            Number.isFinite(n)
            ?
            Math.max(0,n)
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
      .trim();


  value =
    value
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
   PARSE DE ACORDE
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


  const newRoot =
    transposeNote(
      parsed.root,
      semitones
    );


  let result =
    newRoot
    +
    qualityToSymbol(
      parsed.quality
    );


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
   COMPLEXIDADE
========================================= */

function complexityPenalty(
  intervals
){

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
   DETECTOR ANTIGO POR NOTAS

   Mantido por compatibilidade.
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
   NOVO DETECTOR POR CHROMA
========================================= */

export function detectChordFromChroma(
  chroma,
  options = {}
){

  const normalized =
    normalizeChroma(
      chroma
    );


  if(!normalized){

    return {

      valid:false,

      error:
        "Chroma inválido"

    };

  }


  const totalEnergy =
    normalized.reduce(
      (sum,value) =>
        sum + value,
      0
    );


  if(
    totalEnergy <= 0.001
  ){

    return {

      valid:false,

      error:
        "Sem energia harmônica"

    };

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

      const chordPitches =
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


      const chordSet =
        new Set(
          chordPitches
        );


      let insideEnergy = 0;

      let outsideEnergy = 0;


      for(
        let pitch = 0;
        pitch < 12;
        pitch++
      ){

        if(
          chordSet.has(
            pitch
          )
        ){

          insideEnergy +=
            normalized[pitch];

        }

        else{

          outsideEnergy +=
            normalized[pitch];

        }

      }


      const expectedEnergy =
        chordPitches.reduce(
          (sum,pitch) =>
            sum
            +
            normalized[pitch],
          0
        );


      const averageInside =
        expectedEnergy
        /
        chordPitches.length;


      const rootEnergy =
        normalized[
          rootIndex
        ];


      /*
        Energia das notas estruturais.
      */

      let score =
        averageInside
        *
        0.58;


      /*
        Proporção de energia do chroma
        explicada pelo acorde.
      */

      const explainedRatio =
        insideEnergy
        /
        (
          insideEnergy
          +
          outsideEnergy
          +
          1e-9
        );


      score +=
        explainedRatio
        *
        0.36;


      /*
        Pequeno bônus para fundamental
        presente com energia real.
      */

      score +=
        rootEnergy
        *
        0.06;


      /*
        Penaliza energia fora do acorde.
      */

      score -=
        outsideEnergy
        /
        12
        *
        0.12;


      /*
        Penaliza acordes complexos
        quando a evidência não exige.
      */

      score -=
        complexityPenalty(
          intervals
        );


      /*
        Penaliza acordes onde alguma nota
        estrutural praticamente não existe.
      */

      const structuralEnergies =
        chordPitches.map(
          pitch =>
            normalized[pitch]
        );


      const weakStructuralNotes =
        structuralEnergies.filter(
          energy =>
            energy < 0.22
        ).length;


      score -=
        weakStructuralNotes
        *
        0.08;


      candidates.push({

        root:
          NOTES[rootIndex],

        quality,

        chordPitches,

        score,

        explainedRatio,

        rootEnergy,

        insideEnergy,

        outsideEnergy

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
    (
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
      0.38
    )
  ){

    return {

      valid:false,

      error:
        "Nenhum acorde confiável"

    };

  }


  const chord =
    best.root
    +
    qualityToSymbol(
      best.quality
    );


  const expectedNotes =
    best.chordPitches.map(
      pitch =>
        NOTES[pitch]
    );


  const confidence =
    clamp(
      Number(
        best.score
          .toFixed(3)
      ),
      0,
      1
    );


  return {

    valid:true,

    chord,

    root:
      best.root,

    quality:
      best.quality,

    bass:
      null,

    confidence,

    expectedNotes,

    chroma:
      normalized,

    scoreDetails:{

      explainedRatio:
        Number(
          best.explainedRatio
            .toFixed(3)
        ),

      rootEnergy:
        Number(
          best.rootEnergy
            .toFixed(3)
        ),

      insideEnergy:
        Number(
          best.insideEnergy
            .toFixed(3)
        ),

      outsideEnergy:
        Number(
          best.outsideEnergy
            .toFixed(3)
        )

    },

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
              clamp(
                Number(
                  item.score
                    .toFixed(3)
                ),
                0,
                1
              )

          })
        )

  };

}


/* =========================================
   TIMELINE POR NOTAS

   Compatibilidade antiga.
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

          chroma

        };

      }
    );


  return detectChordTimelineFromChroma(
    converted
  );

}


/* =========================================
   NOVA TIMELINE POR CHROMA
========================================= */

export function detectChordTimelineFromChroma(
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
            detectChordFromChroma(
              frame.chroma
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


  let step = 0.20;


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

      step =
        diffs.reduce(
          (sum,value) =>
            sum + value,
          0
        )
        /
        diffs.length;

    }

  }


  const raw = [];


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
      start + step;


    const detection =
      current.detection;


    raw.push({

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


  const merged = [];


  for(
    const segment
    of raw
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
            /
            2
          )
          .toFixed(3)
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
    0.38;


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
      );


  segments =
    segments.map(
      segment => {

        if(
          segment.chord !== "N"
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


  /*
    Microsegmentos.
  */

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
      &&
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


      const source =
        usePrevious
        ?
        previous
        :
        next;


      current.chord =
        source.chord;

      current.notes =
        source.notes;

      current.confidence =
        source.confidence;

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
