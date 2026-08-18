import http from "http";
import {
  analyzeChord,
  transposeChord,
  getNoteNames
} from "./chord-engine.js";
const PORT =
  process.env.PORT || 3000;


/* ================================
   CORS
================================ */

function corsHeaders(){

  return {

    "Access-Control-Allow-Origin":
      "*",

    "Access-Control-Allow-Methods":
      "GET, POST, OPTIONS",

    "Access-Control-Allow-Headers":
      "Content-Type",

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
        req.method ===
        "OPTIONS"
      ){

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
