#!/usr/bin/env bash
# Genera un CA local + certificado con SAN para servir `ng serve --ssl` por HTTPS
# en localhost y en la IP de la LAN (para poder grabar audio desde el móvil,
# que exige contexto seguro).
#
# Uso:  ./generate.sh 192.168.4.19 [10.8.0.4 ...]
#   - pásale las IPs por las que vas a acceder (Wi-Fi, Tailscale, etc.)
#   - vuelve a lanzarlo si cambia tu IP.
#
# Después:
#   1) instala `rootCA.crt` como CA de confianza en el móvil (una sola vez):
#        Android: Ajustes > Seguridad > Cifrado y credenciales > Instalar un certificado > Certificado de CA
#        iOS:     envíatelo por correo/AirDrop > instalar perfil >
#                 Ajustes > General > Información > Ajustes de confianza de certificados > activarlo
#   2) `ng serve --ssl` ya coge certs/dev.crt y certs/dev.key (configurado en angular.json)
set -euo pipefail
cd "$(dirname "$0")"

IPS=("127.0.0.1" "$@")
ALT="DNS.1 = localhost"
i=1
for ip in "${IPS[@]}"; do ALT+=$'\n'"IP.$i = $ip"; i=$((i+1)); done

cat > san.cnf <<EOF
[req]
distinguished_name = dn
prompt = no
[dn]
CN = Cofradia Dev
[v3_leaf]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt
[alt]
$ALT
EOF

export MSYS_NO_PATHCONV=1
[ -f rootCA.key ] || openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
  -keyout rootCA.key -out rootCA.crt -subj "/CN=Cofradia Dev Root CA" \
  -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign"

openssl req -newkey rsa:2048 -nodes -keyout dev.key -out dev.csr -config san.cnf
openssl x509 -req -in dev.csr -CA rootCA.crt -CAkey rootCA.key -CAcreateserial \
  -out dev.crt -days 825 -sha256 -extfile san.cnf -extensions v3_leaf
rm -f dev.csr

echo
echo "OK. SAN del certificado:"
openssl x509 -in dev.crt -noout -text | grep -A1 "Subject Alternative Name"
echo "Instala certs/rootCA.crt como CA de confianza en el móvil (ver cabecera de este script)."
