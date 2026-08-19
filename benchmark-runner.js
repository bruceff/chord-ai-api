import fs from "fs/promises";
import path from "path";
import process from "process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = (
  process.env.BENCHMARK_API_URL
  ||
  "http://localhost:3000"
).replace(/\/$/, "");

const CASES_PATH =
  process.env.BENCHMARK_CASES
  ||
  path.join(
    __dirname,
    "benchmarks",
    "cases.json"
  );

const BASELINE_PATH =
  process.env.BENCHMARK_BASELINE
  ||
  path.join(
    __dirname,
    "benchmarks",
    "baseline.json"
  );

const LAST_RESULT_PATH =
  process.env.BENCHMARK_RESULT
  ||
  path.join(
    __dirname,
    "benchmarks",
    "last-result.json"
  );


/* =====================================================
   ARGUMENTOS
===================================================== */

const args =
  new Set(
    process.argv.slice(2)
  );


const SAVE_BASELINE =
  args.has(
    "--save-baseline"
  );


const STRICT =
  args.has(
    "--strict"
  );


const ONLY_ARG =
  process.argv.find(
    value =>
      value.startsWith(
        "--only="
      )
  );


const ONLY =
  ONLY_ARG
  ?
  ONLY_ARG
    .slice(
      "--only=".length
    )
    .trim()
    .toLowerCase()
  :
  null;


/* =====================================================
   NOTAS
===================================================== */

const SHARP_PC = {

  C:0,

  "C#":1,
  Db:1,

  D:2,

  "D#":3,
  Eb:3,

  E:4,
  Fb:4,

  "E#":5,
  F:5,

  "F#":6,
  Gb:6,

  G:7,

  "G#":8,
  Ab:8,

  A:9,

  "A#":10,
  Bb:10,

  B:11,
  Cb:11,

  "B#":0

};


const PC_TO_SHARP = [

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


/* =====================================================
   HELPERS
===================================================== */

function round(
  value,
  digits = 4
){

  if(
    !Number.isFinite(
      value
    )
  ){

    return null;

  }


  return Number(
    value.toFixed(
      digits
    )
  );

}


function clamp01(
  value
){

  return Math.max(
    0,
    Math.min(
      1,
      value
    )
  );

}


/* =====================================================
   NORMALIZAÇÃO DE NOTAS
===================================================== */

function canonicalNote(
  note
){

  if(!note){

    return null;

  }


  const cleaned =
    String(
      note
    )
    .trim();


  const normalized =
    cleaned
      .charAt(0)
      .toUpperCase()
    +
    cleaned.slice(1);


  const pc =
    SHARP_PC[
      normalized
    ];


  return Number.isInteger(
    pc
  )
  ?
  PC_TO_SHARP[
    pc
  ]
  :
  null;

}


/* =====================================================
   NORMALIZAÇÃO DE QUALIDADE
===================================================== */

function canonicalQuality(
  rawQuality
){

  let q =
    String(
      rawQuality
      ||
      ""
    )
    .trim();


  q =
    q.replace(
      /^:/,
      ""
    );


  q =
    q.replace(
      /\s+/g,
      ""
    );


  if(
    q === ""
    ||
    q === "maj"
    ||
    q === "M"
  ){

    return "maj";

  }


  q =
    q

      .replace(
        /^min/i,
        "m"
      )

      .replace(
        /^minor/i,
        "m"
      )

      .replace(
        /^major/i,
        "maj"
      )

      .replace(
        /Δ/g,
        "maj"
      )

      .replace(
        /ø/g,
        "m7b5"
      )

      .replace(
        /°/g,
        "dim"
      );


  return q.toLowerCase();

}


/* =====================================================
   PARSE DE CIFRA
===================================================== */

function parseChord(
  chordName
){

  if(!chordName){

    return null;

  }


  const raw =
    String(
      chordName
    )
    .trim();


  if(
    !raw
    ||
    /^(N|NC|N\/C|no[_ -]?chord)$/i
      .test(
        raw
      )
  ){

    return {

      raw,

      noChord:
        true,

      root:
        null,

      quality:
        "N",

      bass:
        null

    };

  }


  const [
    head,
    slashBass
  ] =
    raw.split(
      "/",
      2
    );


  const match =
    head.match(
      /^([A-Ga-g](?:#|b)?)(.*)$/
    );


  if(!match){

    return {

      raw,

      invalid:
        true,

      root:
        null,

      quality:
        raw.toLowerCase(),

      bass:
        null

    };

  }


  const root =
    canonicalNote(
      match[1]
    );


  const quality =
    canonicalQuality(
      match[2]
    );


  /*
    Quando não existe slash chord,
    o baixo esperado é a própria raiz.
  */

  const bass =
    canonicalNote(
      slashBass
    )
    ||
    root;


  return {

    raw,

    noChord:
      false,

    root,

    quality,

    bass,

    canonical:
      `${root || "?"}:${quality}/${bass || "?"}`

  };

}


/* =====================================================
   ACORDE PRESENTE EM UM INSTANTE
===================================================== */

function chordAt(
  segments,
  time
){

  for(
    const segment
    of segments
  ){

    const start =
      Number(
        segment.start
      );


    const end =
      Number(
        segment.end
      );


    if(
      time >= start
      &&
      time < end
    ){

      return segment;

    }

  }


  /*
    No instante exato do fim,
    usamos o último segmento.
  */

  const last =
    segments.at(
      -1
    );


  if(
    last
    &&
    Math.abs(
      time
      -
      Number(
        last.end
      )
    )
    <
    1e-9
  ){

    return last;

  }


  return null;

}


/* =====================================================
   DURAÇÃO DA TIMELINE
===================================================== */

function getTimelineDuration(
  expected,
  actual,
  declaredDuration
){

  const candidates = [

    Number(
      declaredDuration
    ),

    Number(
      expected.at(-1)
        ?.end
    ),

    Number(
      actual.at(-1)
        ?.end
    )

  ]
  .filter(
    Number.isFinite
  );


  return candidates.length
  ?
  Math.max(
    ...candidates
  )
  :
  0;

}


/* =====================================================
   DIVIDIR TIMELINE EM INTERVALOS COMUNS
===================================================== */

function collectIntervals(
  expected,
  actual,
  duration
){

  const boundaries =
    new Set(
      [
        0,
        duration
      ]
    );


  for(
    const list
    of [
      expected,
      actual
    ]
  ){

    for(
      const segment
      of list
    ){

      const start =
        clamp01(
          duration > 0
          ?
          Number(
            segment.start
          )
          /
          duration
          :
          0
        )
        *
        duration;


      const end =
        clamp01(
          duration > 0
          ?
          Number(
            segment.end
          )
          /
          duration
          :
          0
        )
        *
        duration;


      if(
        Number.isFinite(
          start
        )
      ){

        boundaries.add(
          start
        );

      }


      if(
        Number.isFinite(
          end
        )
      ){

        boundaries.add(
          end
        );

      }

    }

  }


  const sorted =
    [
      ...boundaries
    ]

    .filter(
      Number.isFinite
    )

    .filter(
      value =>
        value >= 0
        &&
        value <= duration
    )

    .sort(
      (a,b) =>
        a - b
    );


  const intervals =
    [];


  for(
    let i = 0;
    i < sorted.length - 1;
    i++
  ){

    const start =
      sorted[i];


    const end =
      sorted[
        i + 1
      ];


    if(
      end - start
      <=
      1e-9
    ){

      continue;

    }


    intervals.push({

      start,

      end,

      duration:
        end - start,

      midpoint:
        (
          start +
          end
        )
        /
        2

    });

  }


  return intervals;

}


/* =====================================================
   COMPARAÇÃO ENTRE CIFRAS
===================================================== */

function compareParsed(
  expected,
  actual
){

  if(
    !expected
    &&
    !actual
  ){

    return {

      exact:true,
      root:true,
      quality:true,
      bass:true

    };

  }


  if(
    !expected
    ||
    !actual
  ){

    return {

      exact:false,
      root:false,
      quality:false,
      bass:false

    };

  }


  if(
    expected.noChord
    ||
    actual.noChord
  ){

    const match =
      Boolean(
        expected.noChord
        &&
        actual.noChord
      );


    return {

      exact:match,
      root:match,
      quality:match,
      bass:match

    };

  }


  const root =
    expected.root
    ===
    actual.root;


  const quality =
    expected.quality
    ===
    actual.quality;


  const bass =
    expected.bass
    ===
    actual.bass;


  return {

    exact:
      root
      &&
      quality
      &&
      bass,

    root,

    quality,

    bass

  };

}


/* =====================================================
   MÉTRICAS PONDERADAS POR DURAÇÃO
===================================================== */

function durationMetrics(
  expected,
  actual,
  duration
){

  const intervals =
    collectIntervals(
      expected,
      actual,
      duration
    );


  const totals = {

    totalDuration:
      0,

    exact:
      0,

    root:
      0,

    quality:
      0,

    bass:
      0

  };


  const errors =
    [];


  for(
    const interval
    of intervals
  ){

    const expectedSegment =
      chordAt(
        expected,
        interval.midpoint
      );


    const actualSegment =
      chordAt(
        actual,
        interval.midpoint
      );


    const expectedChord =
      parseChord(
        expectedSegment
          ?.chord
        ||
        expectedSegment
          ?.baseChord
        ||
        null
      );


    const actualChord =
      parseChord(
        actualSegment
          ?.chord
        ||
        actualSegment
          ?.baseChord
        ||
        null
      );


    const comparison =
      compareParsed(
        expectedChord,
        actualChord
      );


    totals.totalDuration +=
      interval.duration;


    for(
      const key
      of [
        "exact",
        "root",
        "quality",
        "bass"
      ]
    ){

      if(
        comparison[key]
      ){

        totals[key] +=
          interval.duration;

      }

    }


    if(
      !comparison.exact
    ){

      errors.push({

        start:
          round(
            interval.start,
            3
          ),

        end:
          round(
            interval.end,
            3
          ),

        duration:
          round(
            interval.duration,
            3
          ),

        expected:
          expectedSegment
            ?.chord
          ||
          expectedSegment
            ?.baseChord
          ||
          "N",

        actual:
          actualSegment
            ?.chord
          ||
          actualSegment
            ?.baseChord
          ||
          "N",

        rootMatch:
          comparison.root,

        qualityMatch:
          comparison.quality,

        bassMatch:
          comparison.bass

      });

    }

  }


  const denominator =
    totals.totalDuration
    ||
    1;


  return {

    chordAccuracy:
      round(
        totals.exact
        /
        denominator
      ),

    rootAccuracy:
      round(
        totals.root
        /
        denominator
      ),

    qualityAccuracy:
      round(
        totals.quality
        /
        denominator
      ),

    bassAccuracy:
      round(
        totals.bass
        /
        denominator
      ),

    scoredDuration:
      round(
        totals.totalDuration,
        3
      ),

    errors

  };

}


/* =====================================================
   BOUNDARIES INTERNOS
===================================================== */

function getInternalBoundaries(
  segments,
  duration
){

  return segments

    .map(
      segment =>
        Number(
          segment.start
        )
    )

    .filter(
      Number.isFinite
    )

    .filter(
      time =>
        time > 1e-9
        &&
        time <
        duration - 1e-9
    )

    .sort(
      (a,b) =>
        a - b
    );

}


/* =====================================================
   MÉTRICAS DE BOUNDARY
===================================================== */

function boundaryMetrics(
  expected,
  actual,
  duration,
  tolerance = 0.3
){

  const truth =
    getInternalBoundaries(
      expected,
      duration
    );


  const predicted =
    getInternalBoundaries(
      actual,
      duration
    );


  const usedPredictions =
    new Set();


  const matches =
    [];


  const missed =
    [];


  for(
    const expectedTime
    of truth
  ){

    let bestIndex =
      -1;


    let bestDistance =
      Infinity;


    for(
      let i = 0;
      i < predicted.length;
      i++
    ){

      if(
        usedPredictions.has(
          i
        )
      ){

        continue;

      }


      const distance =
        Math.abs(
          predicted[i]
          -
          expectedTime
        );


      if(
        distance <= tolerance
        &&
        distance <
        bestDistance
      ){

        bestDistance =
          distance;


        bestIndex =
          i;

      }

    }


    if(
      bestIndex >= 0
    ){

      usedPredictions.add(
        bestIndex
      );


      matches.push({

        expected:
          round(
            expectedTime,
            3
          ),

        actual:
          round(
            predicted[
              bestIndex
            ],
            3
          ),

        error:
          round(
            bestDistance,
            3
          )

      });

    }

    else{

      missed.push(
        round(
          expectedTime,
          3
        )
      );

    }

  }


  const extras =
    predicted

      .filter(
        (
          _,
          index
        ) =>
          !usedPredictions.has(
            index
          )
      )

      .map(
        time =>
          round(
            time,
            3
          )
      );


  const tp =
    matches.length;


  const fp =
    extras.length;


  const fn =
    missed.length;


  const precision =
    tp + fp
    ?
    tp
    /
    (
      tp +
      fp
    )
    :
    truth.length === 0
    &&
    predicted.length === 0
    ?
    1
    :
    0;


  const recall =
    tp + fn
    ?
    tp
    /
    (
      tp +
      fn
    )
    :
    truth.length === 0
    ?
    1
    :
    0;


  const f1 =
    precision + recall
    ?
    (
      2 *
      precision *
      recall
    )
    /
    (
      precision +
      recall
    )
    :
    0;


  const mae =
    matches.length
    ?
    matches.reduce(
      (
        sum,
        item
      ) =>
        sum +
        item.error,
      0
    )
    /
    matches.length
    :
    null;


  return {

    toleranceSeconds:
      tolerance,

    precision:
      round(
        precision
      ),

    recall:
      round(
        recall
      ),

    f1:
      round(
        f1
      ),

    meanAbsoluteErrorSeconds:
      round(
        mae,
        4
      ),

    expectedCount:
      truth.length,

    actualCount:
      predicted.length,

    matches,

    missed,

    extras

  };

}


/* =====================================================
   SEQUÊNCIA NORMALIZADA
===================================================== */

function normalizeSequence(
  segments
){

  const output =
    [];


  for(
    const segment
    of segments
  ){

    const parsed =
      parseChord(
        segment.chord
        ||
        segment.baseChord
      );


    const label =
      parsed?.canonical
      ||
      String(
        segment.chord
        ||
        segment.baseChord
        ||
        "N"
      );


    if(
      output.at(-1)
      !==
      label
    ){

      output.push(
        label
      );

    }

  }


  return output;

}


/* =====================================================
   MÉTRICA DE SEQUÊNCIA
===================================================== */

function sequenceMetrics(
  expected,
  actual
){

  const expectedSequence =
    normalizeSequence(
      expected
    );


  const actualSequence =
    normalizeSequence(
      actual
    );


  return {

    exactSequence:
      JSON.stringify(
        expectedSequence
      )
      ===
      JSON.stringify(
        actualSequence
      ),

    expectedCount:
      expectedSequence.length,

    actualCount:
      actualSequence.length,

    expected:
      expectedSequence,

    actual:
      actualSequence

  };

}


/* =====================================================
   JSON
===================================================== */

async function loadJson(
  filePath
){

  return JSON.parse(
    await fs.readFile(
      filePath,
      "utf8"
    )
  );

}


async function saveJson(
  filePath,
  data
){

  await fs.mkdir(
    path.dirname(
      filePath
    ),
    {
      recursive:true
    }
  );


  await fs.writeFile(
    filePath,
    JSON.stringify(
      data,
      null,
      2
    )
    +
    "\n",
    "utf8"
  );

}


/* =====================================================
   ENVIAR WAV PARA API
===================================================== */

async function analyzeWav(
  filePath
){

  const absolutePath =
    path.resolve(
      __dirname,
      filePath
    );


  const wav =
    await fs.readFile(
      absolutePath
    );


  const response =
    await fetch(
      `${API_URL}/analyze-wav`,
      {

        method:
          "POST",

        headers:{

          "Content-Type":
            "audio/wav"

        },

        body:
          wav

      }
    );


  let data;


  try{

    data =
      await response.json();

  }

  catch{

    throw new Error(
      `A API respondeu ${response.status}, mas não retornou JSON válido.`
    );

  }


  if(
    !response.ok
    ||
    !data?.success
  ){

    throw new Error(
      data?.message
      ||
      data?.error
      ||
      `Falha HTTP ${response.status}`
    );

  }


  if(
    !Array.isArray(
      data.chords
    )
  ){

    throw new Error(
      "Resposta da API não contém chords[]."
    );

  }


  return data;

}


/* =====================================================
   COMPARAR COM BASELINE
===================================================== */

function compareAgainstBaseline(
  result,
  baselineCase,
  tolerances
){

  if(
    !baselineCase
  ){

    return {

      available:
        false,

      regressions:
        [],

      deltas:
        {}

    };

  }


  const keys = [

    "chordAccuracy",
    "rootAccuracy",
    "qualityAccuracy",
    "bassAccuracy",
    "boundaryF1"

  ];


  const regressions =
    [];


  const deltas =
    {};


  for(
    const key
    of keys
  ){

    const current =
      Number(
        result.summary[
          key
        ]
      );


    const baseline =
      Number(
        baselineCase
          .summary
          ?.[key]
      );


    if(
      !Number.isFinite(
        current
      )
      ||
      !Number.isFinite(
        baseline
      )
    ){

      continue;

    }


    const delta =
      current -
      baseline;


    deltas[key] =
      round(
        delta
      );


    const allowedDrop =
      Number(
        tolerances
          ?.[key]
        ??
        0.005
      );


    if(
      delta <
      -allowedDrop
    ){

      regressions.push({

        metric:
          key,

        baseline:
          round(
            baseline
          ),

        current:
          round(
            current
          ),

        delta:
          round(
            delta
          ),

        allowedDrop

      });

    }

  }


  return {

    available:
      true,

    deltas,

    regressions,

    passed:
      regressions.length === 0

  };

}


/* =====================================================
   RESULTADO DE UM CASO
===================================================== */

function buildCaseResult(
  testCase,
  apiResult
){

  const expected =
    testCase.expected
    ||
    [];


  const actual =
    apiResult.chords
    ||
    [];


  const duration =
    getTimelineDuration(
      expected,
      actual,
      apiResult.audio
        ?.duration
      ||
      testCase.duration
    );


  const durationScores =
    durationMetrics(
      expected,
      actual,
      duration
    );


  const boundaries =
    boundaryMetrics(
      expected,
      actual,
      duration,
      Number(
        testCase
          .boundaryToleranceSeconds
        ??
        0.3
      )
    );


  const sequence =
    sequenceMetrics(
      expected,
      actual
    );


  return {

    id:
      testCase.id,

    name:
      testCase.name,

    file:
      testCase.file,

    duration:
      round(
        duration,
        3
      ),


    engine:{

      audioEngine:
        apiResult.audioEngine
        ??
        null,

      chordEngine:
        apiResult.chordEngine
        ??
        null,

      reconstructionValidator:
        apiResult
          .reconstructionValidator
        ??
        null

    },


    counts:{

      expected:
        expected.length,

      actual:
        actual.length,

      raw:
        apiResult
          .rawChordCount
        ??
        null,

      validated:
        apiResult
          .validatedChordCount
        ??
        null

    },


    summary:{

      chordAccuracy:
        durationScores
          .chordAccuracy,

      rootAccuracy:
        durationScores
          .rootAccuracy,

      qualityAccuracy:
        durationScores
          .qualityAccuracy,

      bassAccuracy:
        durationScores
          .bassAccuracy,

      boundaryF1:
        boundaries.f1,

      boundaryPrecision:
        boundaries.precision,

      boundaryRecall:
        boundaries.recall,

      boundaryMaeSeconds:
        boundaries
          .meanAbsoluteErrorSeconds,

      exactSequence:
        sequence
          .exactSequence

    },


    durationMetrics:
      durationScores,


    boundaryMetrics:
      boundaries,


    sequence,


    actualChords:
      actual.map(
        chord => ({

          start:
            round(
              Number(
                chord.start
              ),
              4
            ),

          end:
            round(
              Number(
                chord.end
              ),
              4
            ),

          chord:
            chord.chord,

          baseChord:
            chord.baseChord
            ??
            null,

          bassNote:
            chord.bassNote
            ??
            null,

          confidence:
            chord.confidence
            ??
            null,

          reconstructionReason:
            chord
              .reconstructionReason
            ??
            null

        })
      )

  };

}


/* =====================================================
   AGREGAÇÃO GLOBAL
===================================================== */

function aggregate(
  caseResults
){

  const keys = [

    "chordAccuracy",
    "rootAccuracy",
    "qualityAccuracy",
    "bassAccuracy",
    "boundaryF1"

  ];


  const totals =
    Object.fromEntries(
      keys.map(
        key => [
          key,
          0
        ]
      )
    );


  let totalWeight =
    0;


  for(
    const result
    of caseResults
  ){

    const weight =
      Number(
        result.duration
      )
      ||
      1;


    totalWeight +=
      weight;


    for(
      const key
      of keys
    ){

      totals[key] +=
        (
          Number(
            result.summary[
              key
            ]
          )
          ||
          0
        )
        *
        weight;

    }

  }


  const summary =
    {};


  for(
    const key
    of keys
  ){

    summary[key] =
      round(
        totalWeight
        ?
        totals[key]
        /
        totalWeight
        :
        0
      );

  }


  summary.exactSequenceCases =
    caseResults
      .filter(
        item =>
          item.summary
            .exactSequence
      )
      .length;


  summary.caseCount =
    caseResults.length;


  return summary;

}


/* =====================================================
   FORMATAR %
===================================================== */

function pct(
  value
){

  return Number.isFinite(
    Number(
      value
    )
  )
  ?
  `${(
    Number(value)
    *
    100
  ).toFixed(1)}%`
  :
  "—";

}


/* =====================================================
   IMPRIMIR RESULTADO
===================================================== */

function printCase(
  result
){

  console.log(
    `\n=== ${result.name} (${result.id}) ===`
  );


  console.log(
    `Arquivo: ${result.file}`
  );


  console.log(
    `Segmentos: esperado ${result.counts.expected} | detectado ${result.counts.actual}`
  );


  console.log(
    `Acorde exato: ${pct(result.summary.chordAccuracy)}`
  );


  console.log(
    `Raiz:         ${pct(result.summary.rootAccuracy)}`
  );


  console.log(
    `Qualidade:    ${pct(result.summary.qualityAccuracy)}`
  );


  console.log(
    `Baixo:        ${pct(result.summary.bassAccuracy)}`
  );


  console.log(
    `Boundary F1:  ${pct(result.summary.boundaryF1)} (MAE ${result.summary.boundaryMaeSeconds ?? "—"}s)`
  );


  console.log(
    `Sequência:    ${
      result.summary.exactSequence
      ?
      "EXATA"
      :
      "DIFERENTE"
    }`
  );


  if(
    result
      .durationMetrics
      .errors
      .length
  ){

    console.log(
      "Erros por região:"
    );


    for(
      const error
      of result
        .durationMetrics
        .errors
    ){

      console.log(
        `  ${error.start.toFixed(2)}–${error.end.toFixed(2)}s | esperado ${error.expected} | atual ${error.actual}`
      );

    }

  }

}


/* =====================================================
   MAIN
===================================================== */

async function main(){

  const config =
    await loadJson(
      CASES_PATH
    );


  const allCases =
    Array.isArray(
      config.cases
    )
    ?
    config.cases
    :
    [];


  const cases =
    ONLY
    ?
    allCases.filter(
      item =>
        String(
          item.id
        )
        .toLowerCase()
        ===
        ONLY
        ||
        String(
          item.name
        )
        .toLowerCase()
        .includes(
          ONLY
        )
    )
    :
    allCases;


  if(
    !cases.length
  ){

    throw new Error(
      ONLY
      ?
      `Nenhum benchmark corresponde a --only=${ONLY}`
      :
      "Nenhum benchmark configurado."
    );

  }


  let baseline =
    null;


  try{

    baseline =
      await loadJson(
        BASELINE_PATH
      );

  }

  catch{

    baseline =
      null;

  }


  console.log(
    "Chord AI Benchmark Runner"
  );


  console.log(
    `API: ${API_URL}`
  );


  console.log(
    `Casos: ${cases.length}`
  );


  const results =
    [];


  let hadExecutionError =
    false;


  for(
    const testCase
    of cases
  ){

    try{

      const apiResult =
        await analyzeWav(
          testCase.file
        );


      const result =
        buildCaseResult(
          testCase,
          apiResult
        );


      const baselineCase =
        baseline
          ?.cases
          ?.find(
            item =>
              item.id
              ===
              testCase.id
          );


      result.baselineComparison =
        compareAgainstBaseline(
          result,
          baselineCase,
          config.regressionTolerance
        );


      results.push(
        result
      );


      printCase(
        result
      );

    }

    catch(error){

      hadExecutionError =
        true;


      results.push({

        id:
          testCase.id,

        name:
          testCase.name,

        file:
          testCase.file,

        error:
          error.message

      });


      console.error(
        `\n=== ${testCase.name} (${testCase.id}) ===`
      );


      console.error(
        `ERRO: ${error.message}`
      );

    }

  }


  const successful =
    results.filter(
      item =>
        !item.error
    );


  const report = {

    generatedAt:
      new Date()
        .toISOString(),

    apiUrl:
      API_URL,

    configVersion:
      config.version
      ??
      1,

    aggregate:
      aggregate(
        successful
      ),

    cases:
      results

  };


  await saveJson(
    LAST_RESULT_PATH,
    report
  );


  console.log(
    "\n=== RESUMO GLOBAL ==="
  );


  console.log(
    `Acorde exato: ${pct(report.aggregate.chordAccuracy)}`
  );


  console.log(
    `Raiz:         ${pct(report.aggregate.rootAccuracy)}`
  );


  console.log(
    `Qualidade:    ${pct(report.aggregate.qualityAccuracy)}`
  );


  console.log(
    `Baixo:        ${pct(report.aggregate.bassAccuracy)}`
  );


  console.log(
    `Boundary F1:  ${pct(report.aggregate.boundaryF1)}`
  );


  console.log(
    `Sequência exata: ${report.aggregate.exactSequenceCases}/${report.aggregate.caseCount}`
  );


  console.log(
    `Relatório: ${LAST_RESULT_PATH}`
  );


  /* =================================================
     SALVAR BASELINE
  ================================================= */

  if(
    SAVE_BASELINE
  ){

    await saveJson(
      BASELINE_PATH,
      report
    );


    console.log(
      `Baseline salva em: ${BASELINE_PATH}`
    );

  }


  /* =================================================
     REGRESSÕES
  ================================================= */

  const regressions =
    successful.flatMap(
      item =>
        (
          item
            .baselineComparison
            ?.regressions
          ||
          []
        )
        .map(
          regression => ({

            caseId:
              item.id,

            ...regression

          })
        )
    );


  if(
    regressions.length
  ){

    console.log(
      "\nREGRESSÕES VS BASELINE:"
    );


    for(
      const regression
      of regressions
    ){

      console.log(
        `  ${regression.caseId} | ${regression.metric}: ${(regression.delta * 100).toFixed(2)} pp`
      );

    }

  }

  else if(
    baseline
  ){

    console.log(
      "\nNenhuma regressão acima da tolerância configurada."
    );

  }


  /*
    Em modo STRICT:

    qualquer regressão acima da tolerância
    faz o processo terminar com exit code 1.

    Isso permitirá futuramente usar esse runner
    em CI/CD.
  */

  if(
    hadExecutionError
    ||
    (
      STRICT
      &&
      regressions.length
    )
  ){

    process.exitCode =
      1;

  }

}


/* =====================================================
   EXECUTAR
===================================================== */

main()
  .catch(
    error => {

      console.error(
        "\nBenchmark abortado:"
      );


      console.error(
        error
      );


      process.exitCode =
        1;

    }
  );
