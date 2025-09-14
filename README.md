# Hacker News MCP Server

A Model Context Protocol (MCP) server that provides access to Hacker News data through a standardized API.

## Features

- **getTopStories**: Fetch the top stories from Hacker News
- **getStoryComments**: Get comments for a specific story with recursive replies
- **getUser**: Retrieve user profile information
- **getStory**: Fetch a specific story by ID

## Quick Start

### Using Docker

```bash
# Build the Docker image
docker build -t hackernews-mcp .

# Run the MCP server (uses stdio protocol)
docker run --rm hackernews-mcp
```

### Using Node.js directly

```bash
# Install dependencies
npm install

# Start the MCP server
npm start
```

## MCP Protocol

This server implements the Model Context Protocol (MCP) using stdio transport. It communicates via stdin/stdout rather than HTTP endpoints.

## Available Tools

- **getTopStories**: Fetches top stories from Hacker News
  - `limit` (number, optional): Number of stories to fetch (default: 10)

- **getStoryComments**: Fetches comments for a specific story
  - `storyId` (number, required): The Hacker News story ID
  - `maxDepth` (number, optional): Maximum depth of comments (default: 3)

- **getUser**: Fetches user profile information
  - `username` (string, required): The Hacker News username

- **getStory**: Fetches a specific story by ID
  - `storyId` (number, required): The Hacker News story ID

## Docker

The project includes a Dockerfile for easy containerization. The container runs the MCP server using stdio protocol.

## License

MIT
