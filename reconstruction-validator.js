import {
  analyzeChord,
  detectChordCandidatesFromChroma
} from "./chord-engine.js";


const NOTES = [
  "C","C#","D","D#","E","F",
  "F#","G","G#","A","A#","B"
];


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


  const value =
    String(note)
      .trim()
      .toUpperCase()
      .replace("♯","#")
      .replace("♭","B");


  const map = {

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


  const normalized =
    map[value]
    ||
    value;


  return NOTES.includes(
    normalized
  )
    ?
    normalized
    :
    null;

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

          const number =
            Number(value);


          return Number.isFinite(number)
            ?
            Math.max(
              0,
              number
            )
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

    return sorted[
      middle
    ];

  }


  return (
    sorted[middle - 1]
    +
    sorted[middle]
  )
  /
  2;

}


function medianChroma(
  frames
){

  const chromas =
    frames
      .map(
        frame =>
          normalize12(
            frame.chroma
          )
      )
      .filter(Boolean);


  if(
    chromas.length === 0
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
        chromas.map(
          chroma =>
            chroma[pitch]
        )
      );

  }


  return normalize12(
    result
  );

}


function dominantBass(
  frames
){

  const counts =
    new Map();


  let valid = 0;


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


    valid++;


    counts.set(
      note,
      (
        counts.get(note)
        ||
        0
      )
      +
      1
    );

  }


  if(
    counts.size === 0
  ){

    return {

      note:null,

      ratio:0,

      count:0

    };

  }


  const [
    note,
    count
  ] =
    [...counts.entries()]
      .sort(
        (a,b) =>
          b[1] - a[1]
      )[0];


  return {

    note,

    ratio:
      valid
      ?
      count / valid
      :
      0,

    count

  };

}


function baseChordOf(
  segment
){

  if(
    segment?.baseChord
  ){

    return segment.baseChord;

  }


  if(
    typeof segment?.chord !==
    "string"
  ){

    return null;

  }


  return segment.chord
    .split("/")[0];

}


function noteIndices(
  notes
){

  const set =
    new Set();


  for(
    const note
    of notes || []
  ){

    const index =
      NOTES.indexOf(
        normalizeNote(note)
      );


    if(index >= 0){

      set.add(index);

    }

  }


  return set;

}


function characteristicIndices(
  candidate
){

  const parsed =
    analyzeChord(
      candidate.chord
    );


  if(!parsed.valid)
    return [];


  const root =
    NOTES.indexOf(
      parsed.root
    );


  const indices =
    noteIndices(
      parsed.notes
    );


  const majorTriad =
    new Set([
      root,
      (root + 4) % 12,
      (root + 7) % 12
    ]);


  const minorTriad =
    new Set([
      root,
      (root + 3) % 12,
      (root + 7) % 12
    ]);


  const quality =
    candidate.quality
    ||
    "";


  let triad =
    majorTriad;


  if(
    quality.startsWith("MIN")
    ||
    quality === "DIM"
    ||
    quality === "DIM7"
    ||
    quality === "MIN7B5"
  ){

    triad =
      minorTriad;

  }


  return [...indices]
    .filter(
      index =>
        !triad.has(index)
    );

}


function pitchPersistence(
  frames,
  pitchIndex,
  relativeThreshold = 0.30
){

  let valid = 0;

  let present = 0;


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


    if(
      chroma[pitchIndex] >=
      relativeThreshold
    ){

      present++;

    }

  }


  return valid
    ?
    present / valid
    :
    0;

}


function reconstructionMetrics(
  candidate,
  frames,
  regionChroma,
  bass
){

  const analyzed =
    analyzeChord(
      candidate.chord
    );


  if(!analyzed.valid)
    return null;


  const chordSet =
    noteIndices(
      analyzed.notes
    );


  if(
    chordSet.size === 0
  ){

    return null;

  }


  let inside = 0;

  let outside = 0;


  for(
    let pitch = 0;
    pitch < 12;
    pitch++
  ){

    if(
      chordSet.has(pitch)
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
    inside
    /
    total;


  const unexplained =
    outside
    /
    total;


  const structural =
    [...chordSet]
      .map(
        pitch =>
          regionChroma[pitch]
      );


  const missingPenalty =
    structural.reduce(
      (sum,value) =>
        sum
        +
        Math.max(
          0,
          0.28 - value
        ),
      0
    )
    /
    Math.max(
      1,
      structural.length
    )
    /
    0.28;


  const characteristics =
    characteristicIndices(
      candidate
    );


  let persistence;


  if(
    characteristics.length
  ){

    persistence =
      characteristics.reduce(
        (sum,index) =>
          sum
          +
          pitchPersistence(
            frames,
            index,
            0.28
          ),
        0
      )
      /
      characteristics.length;

  }

  else{

    const indexes =
      [...chordSet];


    persistence =
      indexes.reduce(
        (sum,index) =>
          sum
          +
          pitchPersistence(
            frames,
            index,
            0.28
          ),
        0
      )
      /
      indexes.length;

  }


  const rootIndex =
    NOTES.indexOf(
      analyzed.root
    );


  const rootEnergy =
    rootIndex >= 0
    ?
    regionChroma[
      rootIndex
    ]
    :
    0;


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
        1.0;

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
        0.08;

    }


    bassCompatibility *=
      0.55
      +
      0.45
      *
      bass.ratio;

  }


  const reconstructionScore =
    clamp(

        coverage
        *
        0.38

      +

        (
          1 - unexplained
        )
        *
        0.16

      +

        (
          1 - missingPenalty
        )
        *
        0.16

      +

        persistence
        *
        0.18

      +

        bassCompatibility
        *
        0.08

      +

        rootEnergy
        *
        0.04,

      0,
      1

    );


  return {

    reconstructionScore,

    coverage,

    unexplained,

    missingPenalty:
      clamp(
        missingPenalty,
        0,
        1
      ),

    persistence,

    bassCompatibility,

    rootEnergy

  };

}


function formatSlash(
  baseChord,
  bassNote
){

  const analyzed =
    analyzeChord(
      baseChord
    );


  if(!analyzed.valid){

    return baseChord;

  }


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
   RECONSTRUCTION VALIDATOR v1
========================================= */

export function validateChordTimeline(
  timeline,
  frames,
  options = {}
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


  const candidateLimit =
    Number.isFinite(
      Number(
        options.candidateLimit
      )
    )
    ?
    Math.max(
      2,
      Number(
        options.candidateLimit
      )
    )
    :
    8;


  const maxDetectorGap =
    Number.isFinite(
      Number(
        options.maxDetectorGap
      )
    )
    ?
    Number(
      options.maxDetectorGap
    )
    :
    0.18;


  const minReconstructionGain =
    Number.isFinite(
      Number(
        options.minReconstructionGain
      )
    )
    ?
    Number(
      options.minReconstructionGain
    )
    :
    0.055;


  const detectorWeight =
    Number.isFinite(
      Number(
        options.detectorWeight
      )
    )
    ?
    Number(
      options.detectorWeight
    )
    :
    0.56;


  const reconstructionWeight =
    1
    -
    detectorWeight;


  return timeline.map(
    segment => {

      if(
        !segment
        ||
        segment.chord === "N"
      ){

        return segment;

      }


      const regionFrames =
        frames.filter(
          frame =>
            Number(frame.time) >=
            Number(segment.start)
            &&
            Number(frame.time) <
            Number(segment.end)
        );


      /*
        Um único frame de transição
        não pode reescrever a identidade.
      */

      if(
        regionFrames.length < 3
      ){

        return {

          ...segment,

          reconstructionValidated:
            false

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
            false

        };

      }


      const bass =
        dominantBass(
          regionFrames
        );


      const baseChord =
        baseChordOf(
          segment
        );


      let candidates =
        detectChordCandidatesFromChroma(
          regionChroma,
          {

            limit:
              candidateLimit,

            bassNote:
              bass.note,

            bassChroma:
              null

          }
        );


      if(
        candidates.length === 0
      ){

        return {

          ...segment,

          reconstructionValidated:
            false

        };

      }


      const detectorBest =
        candidates[0].score;


      const originalCandidate =
        candidates.find(
          candidate =>
            candidate.chord ===
            baseChord
        );


      /*
        Se o acorde atual ficou fora do
        top-N regional, ainda o mantemos
        para comparar de forma justa.
      */

      if(
        !originalCandidate
        &&
        baseChord
      ){

        const analyzed =
          analyzeChord(
            baseChord
          );


        if(
          analyzed.valid
        ){

          candidates = [

            ...candidates,

            {

              chord:
                baseChord,

              root:
                analyzed.root,

              quality:
                analyzed.quality,

              notes:
                analyzed.notes,

              score:
                detectorBest
                -
                maxDetectorGap

            }

          ];

        }

      }


      const scored =
        candidates
          .map(
            candidate => {

              const metrics =
                reconstructionMetrics(
                  candidate,
                  regionFrames,
                  regionChroma,
                  bass
                );


              if(!metrics)
                return null;


              const detectorNorm =
                clamp(

                  1
                  -
                  Math.max(
                    0,
                    detectorBest
                    -
                    candidate.score
                  )
                  /
                  Math.max(
                    0.001,
                    maxDetectorGap
                  ),

                  0,
                  1

                );


              const finalScore =
                detectorNorm
                *
                detectorWeight
                +
                metrics
                  .reconstructionScore
                *
                reconstructionWeight;


              return {

                ...candidate,

                ...metrics,

                detectorNorm,

                finalScore

              };

            }
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
            false

        };

      }


      const original =
        scored.find(
          candidate =>
            candidate.chord ===
            baseChord
        )
        ||
        scored[0];


      const best =
        scored[0];


      const gain =
        best.reconstructionScore
        -
        original.reconstructionScore;


      const detectorGap =
        detectorBest
        -
        best.score;


      /*
        REGRA CONSERVADORA:

        Só muda quando:
        - alternativa já era plausível;
        - reconstrução melhora claramente;
        - score final também melhora.
      */

      const shouldSwitch =

        best.chord !==
        baseChord

        &&

        detectorGap <=
        maxDetectorGap

        &&

        gain >=
        minReconstructionGain

        &&

        best.finalScore >
        original.finalScore
        +
        0.018;


      const chosen =
        shouldSwitch
        ?
        best
        :
        original;


      const chosenBase =
        chosen.chord;


      const finalChord =
        formatSlash(
          chosenBase,
          bass.note
          ||
          segment.bassNote
        );


      const runnerUp =
        scored.find(
          candidate =>
            candidate.chord !==
            chosenBase
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
          0.18,
          0,
          1
        )
        :
        1;


      const confidence =
        clamp(

          Number(
            segment.confidence
            ||
            0
          )
          *
          0.45

          +

          chosen.reconstructionScore
          *
          0.35

          +

          separation
          *
          0.20,

          0,
          0.95

        );


      return {

        ...segment,

        baseChord:
          chosenBase,

        chord:
          finalChord,

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
            confidence.toFixed(3)
          ),

        reconstructionValidated:
          true,

        reconstructionChanged:
          shouldSwitch,

        reconstruction:{

          score:
            Number(
              chosen
                .reconstructionScore
                .toFixed(3)
            ),

          coverage:
            Number(
              chosen
                .coverage
                .toFixed(3)
            ),

          persistence:
            Number(
              chosen
                .persistence
                .toFixed(3)
            ),

          bassCompatibility:
            Number(
              chosen
                .bassCompatibility
                .toFixed(3)
            ),

          gain:
            Number(
              gain
                .toFixed(3)
            ),

          original:
            baseChord,

          selected:
            chosenBase

        }

      };

    }
  );

}
