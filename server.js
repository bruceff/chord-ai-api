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

    videoId:
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
   SERVIDOR
========================================= */

const server =
  http.createServer(

    async (req,res) => {

      console.log(
        `${req.method} ${req.url}`
      );


      /* =====================================
         PREFLIGHT / CORS
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
              "1.2.0",

            audioEngine:
              true,

            chromaDetection:
              true,

            stabilization:
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
              "online",

            chordEngine:
              "v3"

          }
        );


        return;

      }


      /* =====================================
         ANALYZE YOUTUBE
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

          console.error(
            "Erro /analyze:",
            error
          );


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
         ANALISAR NOME DE ACORDE
      ===================================== */

      if(
        req.method === "GET"
        &&
        req.url.startsWith(
          "/chord?"
        )
      ){

        try{

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
         TRANSPOR ACORDE
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


        const result =
          transposeChord(
            chord,
            semitones
          );


        sendJson(
          res,
          result
            ? 200
            : 400,
          {

            original:
              chord,

            semitones,

            result

          }
        );


        return;

      }


      /* =====================================
         LISTA DE NOTAS
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
         DETECTAR ACORDE VIA POST
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
         DETECTAR ACORDE VIA GET
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
         TIMELINE ANTIGA POR NOTAS
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


          const frames =
            body.frames;


          if(
            !Array.isArray(
              frames
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
              frames
            );


          const timeline =
            stabilizeChordTimeline(
              rawTimeline,
              {

                minDuration:
                  0.55,

                confidenceThreshold:
                  0.38

              }
            );


          sendJson(
            res,
            200,
            {

              success:
                true,

              mode:
                "notes",

              frameCount:
                frames.length,

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
         TESTAR CHROMA
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


        const result =
          createChromaTest(
            notes
          );


        sendJson(
          res,
          200,
          {

            success:
              true,

            input:
              notes,

            result

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


          let threshold =
            Number(
              body.threshold
            );


          if(
            !Number.isFinite(
              threshold
            )
          ){

            threshold =
              0.58;

          }


          const notes =
            chromaToNotes(
              body.chroma,
              {
                threshold
              }
            );


          sendJson(
            res,
            200,
            {

              success:
                true,

              notes

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
         ANALISAR WAV REAL — CHROMA V3
      ===================================== */

      if(
        req.method === "POST"
        &&
        req.url === "/analyze-wav"
      ){

        try{

          const contentType =
            req.headers[
              "content-type"
            ]
            ||
            "";


          if(
            !contentType.includes(
              "audio/wav"
            )
            &&
            !contentType.includes(
              "audio/x-wav"
            )
            &&
            !contentType.includes(
              "application/octet-stream"
            )
          ){

            sendJson(
              res,
              415,
              {

                error:
                  "Envie um arquivo WAV",

                receivedContentType:
                  contentType

              }
            );

            return;

          }


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


          console.log(
            `WAV recebido: ${buffer.length} bytes`
          );


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


          /*
            NOVO:

            Agora não enviamos apenas
            "frame.notes".

            Enviamos o chroma completo.
          */

          const rawTimeline =
            detectChordTimelineFromChroma(

              audio.frames.map(
                frame => ({

                  time:
                    frame.time,

                  chroma:
                    frame.chroma

                })
              )

            );


          const timeline =
            stabilizeChordTimeline(
              rawTimeline,
              {

                minDuration:
                  0.55,

                confidenceThreshold:
                  0.38

              }
            );


          sendJson(
            res,
            200,
            {

              success:
                true,

              engine:
                "Chord AI Audio Engine",

              chordEngine:
                "v3-chroma",

              stabilization:
                true,

              audio:{

                sampleRate:
                  audio.sampleRate,

                duration:
                  Number(
                    audio.duration
                      .toFixed(3)
                  ),

                rawFrameCount:
                  audio.rawFrameCount
                  ??
                  null,

                frameCount:
                  audio.frameCount

              },

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
      "Audio Engine: disponível"
    );

    console.log(
      "Chord Engine v3: CHROMA"
    );

    console.log(
      "Timeline Stabilizer: disponível"
    );

    console.log(
      "POST /analyze-wav: disponível"
    );

    console.log(
      "================================="
    );

  }
);
