# USAR IMAGEN LTS DE NODE
FROM node:22-slim

# CREAR DIRECTORIO DE TRABAJO
WORKDIR /app

# INSTALAR DEPENDENCIAS PRIMERO (CAPA DE CACHÉ)
COPY package*.json ./
RUN npm install --omit=dev

# COPIAR EL RESTO DEL CÓDIGO
COPY . .

# EXPONER EL PUERTO (Railway lo inyectará vía variable de entorno PORT)
EXPOSE 3000

# COMANDO DE INICIO (Railway usará este comando)
CMD ["npm", "start"]
