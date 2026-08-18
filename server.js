import http from "http";
import {
  analyzeChord,
  transposeChord,
  getNoteNames,
  detectChord,
  detectChordTimeline
} from "./chord-engine.js";

import {
  createChromaTest,
  chromaToNotes,
  analyzeWavBuffer
} from "./audio-engine.js";

const PORT =
  process.env.PORT || 3000;


/* ================================
   CORS
================================ */

function corsHeaders(){

  return {

    "Access-Control-Allow-Origin":
      "https://bruceff.github.io",

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

/* ================================
   RESPOSTA JSON
================================ */

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


/* ================================
   VALIDAR VIDEO ID
================================ */

function validVideoId(id){

  return (
    typeof id === "string"
    &&
    /^[a-zA-Z0-9_-]{11}$/
      .test(id)
  );

}


/* ================================
   LER BODY
================================ */

function readBody(req){

  return new Promise(
    (resolve,reject) => {

      let body = "";


      req.on(
        "data",
        chunk => {

          body += chunk;


          if(
            body.length >
            1_000_000
          ){

            reject(
              new Error(
                "Body muito grande"
              )
            );

            req.destroy();

          }
/* ================================
   LER BODY BINÁRIO
================================ */

function readBinaryBody(req){

  return new Promise(
    (resolve,reject) => {

      const chunks = [];

      let total = 0;


      req.on(
        "data",
        chunk => {

          total +=
            chunk.length;


          if(
            total >
            25 * 1024 * 1024
          ){

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

          resolve(
            Buffer.concat(
              chunks
            )
          );

        }
      );


      req.on(
        "error",
        reject
      );

    }
  );

}
        }
      );


      req.on(
        "end",
        () => {

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

    }
  );

}


/* ================================
   METADADOS DO YOUTUBE
================================ */

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
    await fetch(endpoint);


  if(!response.ok){

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


/* ================================
   SERVIDOR
================================ */

const server =
  http.createServer(
    async (req,res) => {

      /* OPTIONS / CORS */

      if(
  req.method === "OPTIONS"
){

  res.writeHead(
    204,
    {
      "Access-Control-Allow-Origin":
        "https://bruceff.github.io",

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

        res.writeHead(
          204,
          corsHeaders()
        );

        res.end();

        return;

      }


      /* HOME */

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
              "1.0.0"

          }
        );

        return;

      }


      /* HEALTH */

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
              "chord-ai-api"

          }
        );

        return;

      }


      /* ANALYZE */

      if(
        req.method === "POST"
        &&
        req.url === "/analyze"
      ){

        try{

          const body =
            await readBody(req);


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


          /*
            Nesta etapa ainda não
            analisamos acordes.

            Primeiro confirmamos:
            Site -> API -> YouTube metadata
          */


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
                  "Motor musical ainda não conectado."

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
/* ================================
   TESTAR MOTOR MUSICAL
================================ */

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



/* ================================
   TRANSPOR ACORDE
================================ */

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



/* ================================
   NOTAS DISPONÍVEIS
================================ */

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
/* ================================
   DETECTAR ACORDE POR NOTAS
================================ */

if(
  req.method === "POST"
  &&
  req.url === "/detect-chord"
){

  try{

    const body =
      await readBody(req);


    const notes =
      body.notes;


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
      /* ================================
   TESTE GET DO DETECTOR
================================ */

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
      /* ================================
   TIMELINE DE ACORDES
================================ */

if(
  req.method === "POST"
  &&
  req.url === "/detect-timeline"
){

  try{

    const body =
      await readBody(req);


    const frames =
      body.frames;


    if(
      !Array.isArray(frames)
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


    const chords =
      detectChordTimeline(
        frames
      );


    sendJson(
      res,
      200,
      {
        success:true,

        frameCount:
          frames.length,

        chordCount:
          chords.length,

        chords
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


/* ================================
   TESTE DA TIMELINE
================================ */

if(
  req.method === "GET"
  &&
  req.url === "/timeline-demo"
){

  const frames = [

    {
      time:0,
      notes:[
        "C","E","G","B"
      ]
    },

    {
      time:2,
      notes:[
        "C","E","G","B"
      ]
    },

    {
      time:4,
      notes:[
        "A","C","E","G"
      ]
    },

    {
      time:6,
      notes:[
        "A","C","E","G"
      ]
    },

    {
      time:8,
      notes:[
        "F","A","C","E"
      ]
    },

    {
      time:10,
      notes:[
        "G","B","D","F"
      ]
    }

  ];


  const chords =
    detectChordTimeline(
      frames
    );


  sendJson(
    res,
    200,
    {
      frames,
      chords
    }
  );


  return;

}
      /* ================================
   TESTAR CHROMA -> NOTAS
================================ */

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

      success:true,

      input:
        notes,

      result

    }
  );


  return;

}


/* ================================
   DETECTAR NOTAS A PARTIR DE CHROMA
================================ */

if(
  req.method === "POST"
  &&
  req.url === "/chroma-to-notes"
){

  try{

    const body =
      await readBody(req);


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


    const notes =
      chromaToNotes(
        body.chroma,
        {

          threshold:
            Number.isFinite(
              Number(
                body.threshold
              )
            )
            ?
            Number(
              body.threshold
            )
            :
            0.58

        }
      );


    sendJson(
      res,
      200,
      {

        success:true,

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
      /* ================================
   ANALISAR WAV
================================ */

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
            "Envie um arquivo WAV"
        }
      );

      return;

    }


    const buffer =
      await readBinaryBody(
        req
      );


    const audio =
      await analyzeWavBuffer(
        buffer,
        {
          threshold:0.56,
          maxNotes:6,
          frameSize:4096,
          hopSize:2048
        }
      );


    const timeline =
      detectChordTimeline(
        audio.frames.map(
          frame => ({
            time:
              frame.time,

            notes:
              frame.notes
          })
        )
      );


    sendJson(
      res,
      200,
      {

        success:true,

        audio:{

          sampleRate:
            audio.sampleRate,

          duration:
            Number(
              audio.duration
                .toFixed(3)
            ),

          frameCount:
            audio.frameCount

        },

        chordCount:
          timeline.length,

        chords:
          timeline

      }
    );

  }
  catch(error){

    console.error(
      error
    );


    sendJson(
      res,
      500,
      {
        error:
          "Falha ao analisar WAV",

        message:
          error.message
      }
    );

  }


  return;

}
      /* 404 */

      sendJson(
        res,
        404,
        {

          error:
            "Rota não encontrada"

        }
      );

    }
  );


/* ================================
   INICIAR
================================ */

server.listen(
  PORT,
  () => {

    console.log(
      "Chord AI API online na porta "
      +
      PORT
    );

  }
);
