FROM node:18

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Make the script executable
RUN chmod +x index.js

# Start the MCP server
ENTRYPOINT ["node", "index.js"]
