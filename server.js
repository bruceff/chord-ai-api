import http from "http";

import {
  analyzeChord,
  transposeChord,
  getNoteNames,
  detectChord,
  detectChordTimeline,
  detectChordTimelineFromChroma,
  stabilizeChordTimeline
} from "./chord-engine.js";

import {
  createChromaTest,
  chromaToNotes,
  analyzeWavBuffer
} from "./audio-engine.js";

import {
  validateChordTimeline
} from "./reconstruction-validator.js";


/* =========================================
   CONFIGURAÇÃO
========================================= */

const PORT =
  process.env.PORT || 3000;


/* =========================================
   CORS
========================================= */

function corsHeaders(){

  return {

    "Access-Control-Allow-Origin":
      "*",

    "Access-Control-Allow-Methods":
      "GET, POST, OPTIONS",

    "Access-Control-Allow-Headers":
      "Content-Type",

    "Access-Control-Max-Age":
      "86400",

    "Content-Type":
      "application/json; charset=utf-8"

  };

}


/* =========================================
   ENVIAR JSON
========================================= */

function sendJson(
  res,
  status,
  data
){

  res.writeHead(
    status,
    corsHeaders()
  );


  res.end(
    JSON.stringify(
      data,
      null,
      2
    )
  );

}


/* =========================================
   VALIDAR VIDEO ID
========================================= */

function validVideoId(id){

  return (
    typeof id === "string"
    &&
    /^[a-zA-Z0-9_-]{11}$/
      .test(id)
  );

}


/* =========================================
   LER BODY JSON
========================================= */

function readBody(req){

  return new Promise(
    (resolve,reject) => {

      let body = "";

      let finished = false;


      req.on(
        "data",
        chunk => {

          if(finished)
            return;


          body += chunk;


          if(
            body.length >
            1_000_000
          ){

            finished = true;


            reject(
              new Error(
                "Body muito grande"
              )
            );


            req.destroy();

          }

        }
      );


      req.on(
        "end",
        () => {

          if(finished)
            return;


          finished = true;


          try{

            resolve(
              body
              ?
              JSON.parse(body)
              :
              {}
            );

          }

          catch{

            reject(
              new Error(
                "JSON inválido"
              )
            );

          }

        }
      );


      req.on(
        "error",
        error => {

          if(finished)
            return;


          finished = true;

          reject(error);

        }
      );

    }
  );

}


/* =========================================
   LER BODY BINÁRIO
========================================= */

function readBinaryBody(req){

  return new Promise(
    (resolve,reject) => {

      const chunks = [];

      let total = 0;

      let finished = false;


      req.on(
        "data",
        chunk => {

          if(finished)
            return;


          total +=
            chunk.length;


          if(
            total >
            25 * 1024 * 1024
          ){

            finished = true;


            reject(
              new Error(
                "Arquivo muito grande"
              )
            );


            req.destroy();

            return;

          }


          chunks.push(
            chunk
          );

        }
      );


      req.on(
        "end",
        () => {

          if(finished)
            return;


          finished = true;


          resolve(
            Buffer.concat(
              chunks
            )
          );

        }
      );


      req.on(
        "error",
        error => {

          if(finished)
            return;


          finished = true;

          reject(error);

        }
      );

    }
  );

}


/* =========================================
   METADADOS DO YOUTUBE
========================================= */

async function getYoutubeMetadata(
  videoId
){

  const videoUrl =
    "https://www.youtube.com/watch?v="
    +
    videoId;


  const endpoint =
    "https://www.youtube.com/oembed"
    +
    "?url="
    +
    encodeURIComponent(
      videoUrl
    )
    +
    "&format=json";


  const response =
    await fetch(
      endpoint
    );


  if(
    !response.ok
  ){

    throw new Error(
      "Não foi possível localizar o vídeo"
    );

  }


  const data =
    await response.json();


  return {

    videoId,

    title:
      data.title || null,

    author:
      data.author_name || null,

    thumbnail:
      data.thumbnail_url || null,

    youtubeUrl:
      videoUrl

  };

}


/* =========================================
   TIMELINE DO BAIXO
========================================= */

function createBassTimeline(
  frames,
  defaultStep = 0.20
){

  if(
    !Array.isArray(frames)
    ||
    frames.length === 0
  ){

    return [];

  }


  let step =
    defaultStep;


  if(
    frames.length >= 2
  ){

    const diff =
      Number(frames[1].time)
      -
      Number(frames[0].time);


    if(
      Number.isFinite(diff)
      &&
      diff > 0
    ){

      step =
        diff;

    }

  }


  const timeline = [];


  for(
    let i = 0;
    i < frames.length;
    i++
  ){

    const frame =
      frames[i];


    const next =
      frames[
        i + 1
      ];


    const start =
      Number(
        frame.time
      );


    if(
      !Number.isFinite(start)
    ){

      continue;

    }


    const end =
      next
      &&
      Number.isFinite(
        Number(next.time)
      )
      ?
      Number(
        next.time
      )
      :
      start
      +
      step;


    const bassNote =
      frame.bassNote
      ||
      "N";


    const previous =
      timeline[
        timeline.length - 1
      ];


    if(
      previous
      &&
      previous.bassNote ===
      bassNote
    ){

      previous.end =
        end;

      previous.frameCount++;

      continue;

    }


    timeline.push({

      start,

      end,

      bassNote,

      frameCount:
        1

    });

  }


  return timeline;

}


/* =========================================
   BAIXO POR REGIÃO DE ACORDE
========================================= */

function createBassByChordRegion(
  chordTimeline,
  frames
){

  if(
    !Array.isArray(chordTimeline)
    ||
    !Array.isArray(frames)
  ){

    return [];

  }


  return chordTimeline.map(
    chord => {

      const members =
        frames.filter(
          frame =>
            frame.time >=
            chord.start
            &&
            frame.time <
            chord.end
        );


      const counts = {};


      for(
        const frame
        of members
      ){

        const bass =
          frame.bassNote;


        if(!bass)
          continue;


        counts[bass] =
          (
            counts[bass]
            ||
            0
          )
          +
          1;

      }


      const ranking =
        Object.entries(
          counts
        )
        .sort(
          (a,b) =>
            b[1] - a[1]
        );


      const dominantBass =
        ranking.length
        ?
        ranking[0][0]
        :
        null;


      const dominantCount =
        ranking.length
        ?
        ranking[0][1]
        :
        0;


      const bassConfidence =
        members.length > 0
        ?
        dominantCount
        /
        members.length
        :
        0;


      return {

        start:
          chord.start,

        end:
          chord.end,

        detectedChord:
          chord.chord,

        dominantBass,

        bassConfidence:
          Number(
            bassConfidence
              .toFixed(3)
          ),

        bassRanking:
          ranking
            .slice(0,4)
            .map(
              ([note,count]) => ({

                note,

                count

              })
            )

      };

    }
  );

}


/* =========================================
   SERVIDOR
========================================= */

const server =
  http.createServer(

    async (req,res) => {

      console.log(
        `${req.method} ${req.url}`
      );


      /* =====================================
         PREFLIGHT
      ===================================== */

      if(
        req.method === "OPTIONS"
      ){

        res.writeHead(
          204,
          {

            "Access-Control-Allow-Origin":
              "*",

            "Access-Control-Allow-Methods":
              "GET, POST, OPTIONS",

            "Access-Control-Allow-Headers":
              "Content-Type",

            "Access-Control-Max-Age":
              "86400"

          }
        );


        res.end();

        return;

      }


      /* =====================================
         HOME
      ===================================== */

      if(
        req.method === "GET"
        &&
        req.url === "/"
      ){

        sendJson(
          res,
          200,
          {

            name:
              "Chord AI API",

            status:
              "online",

            version:
              "1.5.0",

            audioEngine:
              "v3-bass",

            chordEngine:
              "v9",

            reconstructionValidator:
              "v2",

            bassDiagnostics:
              true

          }
        );


        return;

      }


      /* =====================================
         HEALTH
      ===================================== */

      if(
        req.method === "GET"
        &&
        req.url === "/health"
      ){

        sendJson(
          res,
          200,
          {

            status:
              "ok",

            service:
              "chord-ai-api",

            audioEngine:
              "v3-bass",

            chordEngine:
              "v9",

            reconstructionValidator:
              "v2",

            bassDetector:
              "online"

          }
        );


        return;

      }


      /* =====================================
         YOUTUBE
      ===================================== */

      if(
        req.method === "POST"
        &&
        req.url === "/analyze"
      ){

        try{

          const body =
            await readBody(
              req
            );


          const videoId =
            body.videoId;


          if(
            !validVideoId(
              videoId
            )
          ){

            sendJson(
              res,
              400,
              {
                error:
                  "videoId inválido"
              }
            );


            return;

          }


          const metadata =
            await getYoutubeMetadata(
              videoId
            );


          sendJson(
            res,
            200,
            {

              success:
                true,

              stage:
                "metadata",

              video:
                metadata,

              analysis:{

                available:
                  false,

                message:
                  "Motor musical para YouTube ainda não conectado."

              },

              key:
                null,

              bpm:
                null,

              chords:
                []

            }
          );

        }

        catch(error){

          sendJson(
            res,
            500,
            {

              error:
                "Erro interno",

              message:
                error.message

            }
          );

        }


        return;

      }


      /* =====================================
         ACORDE
      ===================================== */

      if(
        req.method === "GET"
        &&
        req.url.startsWith(
          "/chord?"
        )
      ){

        const url =
          new URL(
            req.url,
            "http://localhost"
          );


        const name =
          url.searchParams.get(
            "name"
          );


        if(!name){

          sendJson(
            res,
            400,
            {
              error:
                "Informe um acorde"
            }
          );


          return;

        }


        const result =
          analyzeChord(
            name
          );


        sendJson(
          res,
          result.valid
            ? 200
            : 400,
          result
        );


        return;

      }


      /* =====================================
         TRANSPOSIÇÃO
      ===================================== */

      if(
        req.method === "GET"
        &&
        req.url.startsWith(
          "/transpose?"
        )
      ){

        const url =
          new URL(
            req.url,
            "http://localhost"
          );


        const chord =
          url.searchParams.get(
            "chord"
          );


        const semitones =
          Number(
            url.searchParams.get(
              "semitones"
            )
          );


        if(
          !chord
          ||
          !Number.isFinite(
            semitones
          )
        ){

          sendJson(
            res,
            400,
            {
              error:
                "Parâmetros inválidos"
            }
          );


          return;

        }


        sendJson(
          res,
          200,
          {

            original:
              chord,

            semitones,

            result:
              transposeChord(
                chord,
                semitones
              )

          }
        );


        return;

      }


      /* =====================================
         NOTAS
      ===================================== */

      if(
        req.method === "GET"
        &&
        req.url === "/notes"
      ){

        sendJson(
          res,
          200,
          {
            notes:
              getNoteNames()
          }
        );


        return;

      }


      /* =====================================
         DETECTAR ACORDE POST
      ===================================== */

      if(
        req.method === "POST"
        &&
        req.url === "/detect-chord"
      ){

        try{

          const body =
            await readBody(
              req
            );


          const result =
            detectChord(
              body.notes
            );


          sendJson(
            res,
            result.valid
              ? 200
              : 400,
            result
          );

        }

        catch(error){

          sendJson(
            res,
            500,
            {
              error:
                error.message
            }
          );

        }


        return;

      }


      /* =====================================
         DETECTAR ACORDE GET
      ===================================== */

      if(
        req.method === "GET"
        &&
        req.url.startsWith(
          "/detect?"
        )
      ){

        const url =
          new URL(
            req.url,
            "http://localhost"
          );


        const raw =
          url.searchParams.get(
            "notes"
          );


        if(!raw){

          sendJson(
            res,
            400,
            {
              error:
                "Informe notes"
            }
          );


          return;

        }


        const notes =
          raw
            .split(",")
            .map(
              note =>
                note.trim()
            );


        const result =
          detectChord(
            notes
          );


        sendJson(
          res,
          result.valid
            ? 200
            : 400,
          result
        );


        return;

      }


      /* =====================================
         TIMELINE POR NOTAS
      ===================================== */

      if(
        req.method === "POST"
        &&
        req.url === "/detect-timeline"
      ){

        try{

          const body =
            await readBody(
              req
            );


          if(
            !Array.isArray(
              body.frames
            )
          ){

            sendJson(
              res,
              400,
              {
                error:
                  "frames precisa ser um array"
              }
            );


            return;

          }


          const rawTimeline =
            detectChordTimeline(
              body.frames
            );


          const timeline =
            stabilizeChordTimeline(
              rawTimeline
            );


          sendJson(
            res,
            200,
            {

              success:
                true,

              rawChordCount:
                rawTimeline.length,

              chordCount:
                timeline.length,

              chords:
                timeline

            }
          );

        }

        catch(error){

          sendJson(
            res,
            500,
            {
              error:
                error.message
            }
          );

        }


        return;

      }


      /* =====================================
         TIMELINE DEMO
      ===================================== */

      if(
        req.method === "GET"
        &&
        req.url === "/timeline-demo"
      ){

        const frames = [

          {
            time:0,
            notes:[
              "C",
              "E",
              "G",
              "B"
            ]
          },

          {
            time:2,
            notes:[
              "C",
              "E",
              "G",
              "B"
            ]
          },

          {
            time:4,
            notes:[
              "A",
              "C",
              "E",
              "G"
            ]
          },

          {
            time:6,
            notes:[
              "A",
              "C",
              "E",
              "G"
            ]
          },

          {
            time:8,
            notes:[
              "F",
              "A",
              "C",
              "E"
            ]
          },

          {
            time:10,
            notes:[
              "G",
              "B",
              "D",
              "F"
            ]
          }

        ];


        const rawTimeline =
          detectChordTimeline(
            frames
          );


        const timeline =
          stabilizeChordTimeline(
            rawTimeline
          );


        sendJson(
          res,
          200,
          {

            frames,

            rawTimeline,

            timeline

          }
        );


        return;

      }


      /* =====================================
         CHROMA TEST
      ===================================== */

      if(
        req.method === "GET"
        &&
        req.url.startsWith(
          "/chroma-test?"
        )
      ){

        const url =
          new URL(
            req.url,
            "http://localhost"
          );


        const rawNotes =
          url.searchParams.get(
            "notes"
          );


        if(!rawNotes){

          sendJson(
            res,
            400,
            {
              error:
                "Informe notes"
            }
          );


          return;

        }


        const notes =
          rawNotes
            .split(",")
            .map(
              note =>
                note.trim()
            );


        sendJson(
          res,
          200,
          {

            success:
              true,

            result:
              createChromaTest(
                notes
              )

          }
        );


        return;

      }


      /* =====================================
         CHROMA -> NOTAS
      ===================================== */

      if(
        req.method === "POST"
        &&
        req.url === "/chroma-to-notes"
      ){

        try{

          const body =
            await readBody(
              req
            );


          if(
            !Array.isArray(
              body.chroma
            )
            ||
            body.chroma.length !== 12
          ){

            sendJson(
              res,
              400,
              {
                error:
                  "chroma precisa ter 12 valores"
              }
            );


            return;

          }


          sendJson(
            res,
            200,
            {

              success:
                true,

              notes:
                chromaToNotes(
                  body.chroma,
                  {

                    threshold:
                      Number(
                        body.threshold
                      )
                      ||
                      0.58

                  }
                )

            }
          );

        }

        catch(error){

          sendJson(
            res,
            500,
            {
              error:
                error.message
            }
          );

        }


        return;

      }


      /* =====================================
         ANALISAR WAV
      ===================================== */

      if(
        req.method === "POST"
        &&
        req.url === "/analyze-wav"
      ){

        try{

          const buffer =
            await readBinaryBody(
              req
            );


          if(
            !buffer
            ||
            buffer.length === 0
          ){

            sendJson(
              res,
              400,
              {
                error:
                  "Arquivo WAV vazio"
              }
            );


            return;

          }


          /* =================================
             AUDIO ENGINE
          ================================= */

          const audio =
            await analyzeWavBuffer(
              buffer,
              {

                threshold:
                  0.56,

                maxNotes:
                  5,

                frameSize:
                  4096,

                hopSize:
                  2048,

                windowSeconds:
                  0.28,

                decisionHopSeconds:
                  0.20

              }
            );


          /* =================================
             FRAMES COMPLETOS

             v2 mantém todas as features
             úteis para reconstrução.
          ================================= */

          const analysisFrames =
            audio.frames.map(
              frame => ({

                time:
                  frame.time,

                chroma:
                  frame.chroma,

                bassChroma:
                  frame.bassChroma,

                bassProfile:
                  frame.bassProfile,

                bassNote:
                  frame.bassNote,

                bassFullNote:
                  frame.bassFullNote,

                bassMidi:
                  frame.bassMidi,

                bassConfidence:
                  frame.bassConfidence,

                rms:
                  frame.rms,

                spectralCentroid:
                  frame.spectralCentroid,

                spectralFlatness:
                  frame.spectralFlatness

              })
            );


          /* =================================
             1. CHORD ENGINE
          ================================= */

          const rawTimeline =
            detectChordTimelineFromChroma(
              analysisFrames,
              {

                candidateLimit:
                  6,

                changePenalty:
                  0.18,

                stayBonus:
                  0.055,

                emissionWeight:
                  1.45,

                bassWeight:
                  0.34

              }
            );


          /* =================================
             2. RECONSTRUCTION VALIDATOR v2
          ================================= */

          const validatedTimeline =
            validateChordTimeline(
              rawTimeline,
              analysisFrames,
              {

                detectorWeight:
                  0.48,

                detectorRange:
                  0.30,

                minFinalAdvantage:
                  0.035,

                minReconstructionGain:
                  0.025,

                bassRescueAdvantage:
                  0.020,

                boundaryMaxDuration:
                  0.32,

                boundaryMaxFrames:
                  2,

                boundaryOwnAdvantage:
                  0.045,

                boundaryNeighborAdvantage:
                  0.015

              }
            );


          /* =================================
             3. ESTABILIZAÇÃO FINAL
          ================================= */

          const timeline =
            stabilizeChordTimeline(
              validatedTimeline,
              {

                minDuration:
                  0.45

              }
            );


          /* =================================
             DIAGNÓSTICO DO BAIXO
          ================================= */

          const bassTimeline =
            createBassTimeline(
              analysisFrames,
              0.20
            );


          const bassByChordRegion =
            createBassByChordRegion(
              timeline,
              analysisFrames
            );


          /* =================================
             LOG DO VALIDATOR
          ================================= */

          console.log(
            "====== RECONSTRUCTION VALIDATOR v2 ======"
          );


          for(
            const chord
            of validatedTimeline
          ){

            console.log(

              Number(
                chord.start
              ).toFixed(2),

              "→",

              Number(
                chord.end
              ).toFixed(2),

              "| chord:",

              chord.chord,

              "| validated:",

              chord.reconstructionValidated
              ??
              false,

              "| changed:",

              chord.reconstructionChanged
              ??
              false,

              "| reason:",

              chord.reconstructionReason
              ??
              "-",

              "| score:",

              chord.reconstruction?.score
              ??
              "-"

            );

          }


          /* =================================
             LOG BASS TIMELINE
          ================================= */

          console.log(
            "====== BASS TIMELINE ======"
          );


          for(
            const item
            of bassTimeline
          ){

            console.log(

              Number(
                item.start
              ).toFixed(2),

              "→",

              Number(
                item.end
              ).toFixed(2),

              "| bass:",

              item.bassNote

            );

          }


          /* =================================
             LOG BASS BY CHORD
          ================================= */

          console.log(
            "====== BASS BY CHORD ======"
          );


          for(
            const item
            of bassByChordRegion
          ){

            console.log(

              Number(
                item.start
              ).toFixed(2),

              "→",

              Number(
                item.end
              ).toFixed(2),

              "| chord:",

              item.detectedChord,

              "| bass:",

              item.dominantBass,

              "| confidence:",

              item.bassConfidence

            );

          }


          /* =================================
             RESPOSTA
          ================================= */

          sendJson(
            res,
            200,
            {

              success:
                true,

              engine:
                "Chord AI",

              audioEngine:
                "v3-bass",

              chordEngine:
                "v9",

              reconstructionValidator:
                "v2",

              audio:{

                sampleRate:
                  audio.sampleRate,

                duration:
                  Number(
                    audio.duration
                      .toFixed(3)
                  ),

                rawFrameCount:
                  audio.rawFrameCount,

                frameCount:
                  audio.frameCount

              },

              rawChordCount:
                rawTimeline.length,

              validatedChordCount:
                validatedTimeline.length,

              chordCount:
                timeline.length,

              chords:
                timeline,

              debug:{

                reconstructionEnabled:
                  true,

                reconstructionVersion:
                  "v2",

                bassTimeline,

                bassByChordRegion

              }

            }
          );

        }

        catch(error){

          console.error(
            "ERRO /analyze-wav:",
            error
          );


          sendJson(
            res,
            500,
            {

              error:
                "Falha ao analisar WAV",

              message:
                error.message,

              name:
                error.name

            }
          );

        }


        return;

      }


      /* =====================================
         404
      ===================================== */

      sendJson(
        res,
        404,
        {

          error:
            "Rota não encontrada",

          method:
            req.method,

          path:
            req.url

        }
      );

    }
  );


/* =========================================
   INICIAR SERVIDOR
========================================= */

server.listen(
  PORT,
  () => {

    console.log(
      "================================="
    );

    console.log(
      "Chord AI API online"
    );

    console.log(
      `Porta: ${PORT}`
    );

    console.log(
      "Audio Engine: v3-bass"
    );

    console.log(
      "Chord Engine: v9"
    );

    console.log(
      "Reconstruction Validator: v2"
    );

    console.log(
      "Bass diagnostics: ON"
    );

    console.log(
      "================================="
    );

  }
);
