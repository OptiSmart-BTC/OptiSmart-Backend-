const crypto = require("crypto");

async function decryptData(dataToDecrypt) {
  if (!dataToDecrypt) {
    throw new Error("No se proporcionaron datos para desencriptar.");
  }

  const decipher = crypto.createDecipheriv(
    "aes-128-ecb",
    Buffer.from("0123456789ABCDEF", "utf8"),
    null
  );
  decipher.setAutoPadding(true);

  return (
    decipher.update(dataToDecrypt, "base64", "utf8") + decipher.final("utf8")
  );
}

if (require.main === module) {
  decryptData(process.argv[2])
    .then((decryptedData) => {
      console.log("Datos desencriptados:", decryptedData);
    })
    .catch((error) => {
      console.error("Error al desencriptar:", error.message);
      process.exitCode = 1;
    });
}

module.exports = { decryptData };
