/**
 * Sélectionne le provider de publication sociale.
 * PUBLISHER=buffer (défaut, nouveau) | meta (ancien, conservé pour rollback).
 */

const bufferPublisher = require("./providers/bufferPublisher");
const metaPublisher = require("./providers/metaPublisher");

const providers = { buffer: bufferPublisher, meta: metaPublisher };

function getPublisher(name = process.env.PUBLISHER || "buffer") {
  const key = String(name).toLowerCase();
  const provider = providers[key];
  if (!provider) {
    throw new Error(`Provider inconnu : "${name}". Valeurs valides : ${Object.keys(providers).join(", ")}.`);
  }
  return provider;
}

module.exports = { getPublisher };
