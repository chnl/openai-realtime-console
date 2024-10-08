# Use the Node.js base image
FROM node:18-alpine

# Set the working directory to /usr/src/app
WORKDIR /usr/src/app

# Copy the root package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the entire project into the container
COPY . .

# Expose the port the relay server will run on
EXPOSE 7301

# Set the environment variable for the port
ENV PORT=7301

# Start the relay server using the npm script
CMD ["npm", "run", "relay"]
