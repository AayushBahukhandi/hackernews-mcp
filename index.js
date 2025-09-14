#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

// Hacker News API base URL
const HN_API_BASE = 'https://hacker-news.firebaseio.com/v0';

// Hacker News API Functions
async function getTopStories(limit = 10) {
  try {
    const topIds = await axios.get(`${HN_API_BASE}/topstories.json`).then(r => r.data);
    const stories = await Promise.all(
      topIds.slice(0, limit).map(id =>
        axios.get(`${HN_API_BASE}/item/${id}.json`).then(r => r.data)
      )
    );
    return stories;
  } catch (error) {
    throw new Error(`Failed to fetch top stories: ${error.message}`);
  }
}

async function getStoryComments(storyId, maxDepth = 3, currentDepth = 0) {
  try {
    const story = await axios.get(`${HN_API_BASE}/item/${storyId}.json`).then(r => r.data);
    
    if (!story || !story.kids) {
      return { story, comments: [] };
    }

    const comments = [];
    for (const commentId of story.kids.slice(0, 20)) { // Limit to first 20 comments
      try {
        const comment = await axios.get(`${HN_API_BASE}/item/${commentId}.json`).then(r => r.data);
        if (comment && comment.type === 'comment') {
          let replies = [];
          if (currentDepth < maxDepth && comment.kids) {
            replies = await getStoryComments(commentId, maxDepth, currentDepth + 1);
          }
          comments.push({
            ...comment,
            replies: replies.comments || []
          });
        }
      } catch (error) {
        console.warn(`Failed to fetch comment ${commentId}:`, error.message);
      }
    }

    return { story, comments };
  } catch (error) {
    throw new Error(`Failed to fetch story comments: ${error.message}`);
  }
}

async function getUser(username) {
  try {
    const user = await axios.get(`${HN_API_BASE}/user/${username}.json`).then(r => r.data);
    return user;
  } catch (error) {
    throw new Error(`Failed to fetch user ${username}: ${error.message}`);
  }
}

async function getStory(storyId) {
  try {
    const story = await axios.get(`${HN_API_BASE}/item/${storyId}.json`).then(r => r.data);
    return story;
  } catch (error) {
    throw new Error(`Failed to fetch story ${storyId}: ${error.message}`);
  }
}

// Create MCP Server
const server = new Server(
  {
    name: 'hackernews-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'getTopStories',
        description: 'Fetches the top stories from Hacker News',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Number of top stories to fetch (default: 10)',
              default: 10
            }
          }
        }
      },
      {
        name: 'getStoryComments',
        description: 'Fetches comments for a specific story ID recursively',
        inputSchema: {
          type: 'object',
          properties: {
            storyId: {
              type: 'number',
              description: 'The Hacker News story ID'
            },
            maxDepth: {
              type: 'number',
              description: 'Maximum depth of comments to fetch (default: 3)',
              default: 3
            }
          },
          required: ['storyId']
        }
      },
      {
        name: 'getUser',
        description: 'Fetches a user profile by username',
        inputSchema: {
          type: 'object',
          properties: {
            username: {
              type: 'string',
              description: 'The Hacker News username'
            }
          },
          required: ['username']
        }
      },
      {
        name: 'getStory',
        description: 'Fetches a specific story by ID',
        inputSchema: {
          type: 'object',
          properties: {
            storyId: {
              type: 'number',
              description: 'The Hacker News story ID'
            }
          },
          required: ['storyId']
        }
      }
    ]
  };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    let result;
    switch (name) {
      case 'getTopStories':
        result = await getTopStories(args?.limit || 10);
        break;
      case 'getStoryComments':
        if (!args?.storyId) {
          throw new Error('storyId is required for getStoryComments');
        }
        result = await getStoryComments(args.storyId, args?.maxDepth || 3);
        break;
      case 'getUser':
        if (!args?.username) {
          throw new Error('username is required for getUser');
        }
        result = await getUser(args.username);
        break;
      case 'getStory':
        if (!args?.storyId) {
          throw new Error('storyId is required for getStory');
        }
        result = await getStory(args.storyId);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Hacker News MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});