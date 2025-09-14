#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

// Hacker News API base URLs
const HN_API_BASE = 'https://hacker-news.firebaseio.com/v0';
const ALGOLIA_API_BASE = 'http://hn.algolia.com/api/v1';

// Default values
const DEFAULT_NUM_STORIES = 10;
const DEFAULT_NUM_COMMENTS = 10;
const DEFAULT_COMMENT_DEPTH = 2;

// Helper Functions
function validateCommentsIsListOfDicts(comments) {
  return comments && comments.length > 0 && typeof comments[0] === 'object' && !Array.isArray(comments[0]);
}

async function getStoryInfo(storyId) {
  try {
    const response = await axios.get(`${ALGOLIA_API_BASE}/items/${storyId}`);
    return response.data;
  } catch (error) {
    throw new Error(`Failed to fetch story info: ${error.message}`);
  }
}

function formatStoryDetails(story, basic = true) {
  const output = {
    id: story.story_id,
    author: story.author,
  };
  
  if (story.title) {
    output.title = story.title;
  }
  if (story.points !== undefined) {
    output.points = story.points;
  }
  if (story.url) {
    output.url = story.url;
  }
  
  if (!basic && story.children) {
    if (!validateCommentsIsListOfDicts(story.children)) {
      // Need to fetch full story info for comments
      return null; // Will be handled by caller
    }
    output.comments = story.children.map(child => formatCommentDetails(child));
  }
  
  return output;
}

function formatCommentDetails(comment, depth = DEFAULT_COMMENT_DEPTH, numComments = DEFAULT_NUM_COMMENTS) {
  const output = {
    author: comment.author,
    text: comment.text,
  };
  
  if (depth > 1 && comment.children && comment.children.length > 0) {
    output.comments = comment.children
      .slice(0, numComments)
      .map(child => formatCommentDetails(child, depth - 1, numComments));
  }
  
  return output;
}

// Main API Functions
async function getStories(storyType, numStories = DEFAULT_NUM_STORIES) {
  try {
    const normalizedType = storyType.toLowerCase().trim();
    const validTypes = ['top', 'new', 'ask_hn', 'show_hn'];
    
    if (!validTypes.includes(normalizedType)) {
      throw new Error('story_type must be one of: top, new, ask_hn, show_hn');
    }

    const apiParams = {
      top: { endpoint: 'search', tags: 'front_page' },
      new: { endpoint: 'search_by_date', tags: 'story' },
      ask_hn: { endpoint: 'search', tags: 'ask_hn' },
      show_hn: { endpoint: 'search', tags: 'show_hn' }
    };

    const params = apiParams[normalizedType];
    const url = `${ALGOLIA_API_BASE}/${params.endpoint}?tags=${params.tags}&hitsPerPage=${numStories}`;
    
    const response = await axios.get(url);
    return response.data.hits.map(story => formatStoryDetails(story));
  } catch (error) {
    throw new Error(`Failed to fetch stories: ${error.message}`);
  }
}

async function searchStories(query, numResults = DEFAULT_NUM_STORIES, searchByDate = false) {
  try {
    const endpoint = searchByDate ? 'search_by_date' : 'search';
    const url = `${ALGOLIA_API_BASE}/${endpoint}?query=${encodeURIComponent(query)}&hitsPerPage=${numResults}&tags=story`;
    
    const response = await axios.get(url);
    return response.data.hits.map(story => formatStoryDetails(story));
  } catch (error) {
    throw new Error(`Failed to search stories: ${error.message}`);
  }
}

async function getStoryInfoWithComments(storyId) {
  try {
    const story = await getStoryInfo(storyId);
    const formatted = formatStoryDetails(story, false);
    
    if (formatted === null) {
      // Need to fetch full story info for comments
      const fullStory = await getStoryInfo(storyId);
      return formatStoryDetails(fullStory, false);
    }
    
    return formatted;
  } catch (error) {
    throw new Error(`Failed to get story info: ${error.message}`);
  }
}

async function getUserStories(userName, numStories = DEFAULT_NUM_STORIES) {
  try {
    const url = `${ALGOLIA_API_BASE}/search?tags=author_${userName},story&hitsPerPage=${numStories}`;
    const response = await axios.get(url);
    return response.data.hits.map(story => formatStoryDetails(story));
  } catch (error) {
    throw new Error(`Failed to fetch user stories: ${error.message}`);
  }
}

async function getUserInfo(userName, numStories = DEFAULT_NUM_STORIES) {
  try {
    const url = `${ALGOLIA_API_BASE}/users/${userName}`;
    const response = await axios.get(url);
    const userData = response.data;
    
    // Add user's stories
    userData.stories = await getUserStories(userName, numStories);
    
    return userData;
  } catch (error) {
    throw new Error(`Failed to get user info: ${error.message}`);
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
        name: 'get_stories',
        description: 'Get stories from Hacker News. The options are `top`, `new`, `ask_hn`, `show_hn` for types of stories. This doesn\'t include the comments. Use `get_story_info` to get the comments.',
        inputSchema: {
          type: 'object',
          properties: {
            story_type: {
              type: 'string',
              description: 'Type of stories to get, one of: `top`, `new`, `ask_hn`, `show_hn`',
              default: 'top'
            },
            num_stories: {
              type: 'integer',
              description: 'Number of stories to get',
              default: DEFAULT_NUM_STORIES
            }
          }
        }
      },
      {
        name: 'get_story_info',
        description: 'Get detailed story info from Hacker News, including the comments',
        inputSchema: {
          type: 'object',
          properties: {
            story_id: {
              type: 'integer',
              description: 'Story ID'
            }
          },
          required: ['story_id']
        }
      },
      {
        name: 'search_stories',
        description: 'Search stories from Hacker News. It is generally recommended to use simpler queries to get a broader set of results (less than 5 words). Very targeted queries may not return any results.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query'
            },
            search_by_date: {
              type: 'boolean',
              description: 'Search by date, defaults to false. If this is false, then we search by relevance, then points, then number of comments.',
              default: false
            },
            num_results: {
              type: 'integer',
              description: 'Number of results to get',
              default: DEFAULT_NUM_STORIES
            }
          },
          required: ['query']
        }
      },
      {
        name: 'get_user_info',
        description: 'Get user info from Hacker News, including the stories they\'ve submitted',
        inputSchema: {
          type: 'object',
          properties: {
            user_name: {
              type: 'string',
              description: 'Username of the user'
            },
            num_stories: {
              type: 'integer',
              description: `Number of stories to get, defaults to ${DEFAULT_NUM_STORIES}`,
              default: DEFAULT_NUM_STORIES
            }
          },
          required: ['user_name']
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
      case 'get_stories':
        const storyType = args?.story_type || 'top';
        const numStories = args?.num_stories || DEFAULT_NUM_STORIES;
        result = await getStories(storyType, numStories);
        break;
      case 'get_story_info':
        if (!args?.story_id) {
          throw new Error('story_id is required for get_story_info');
        }
        result = await getStoryInfoWithComments(args.story_id);
        break;
      case 'search_stories':
        if (!args?.query) {
          throw new Error('query is required for search_stories');
        }
        const query = args.query;
        const searchByDate = args?.search_by_date || false;
        const numResults = args?.num_results || DEFAULT_NUM_STORIES;
        result = await searchStories(query, numResults, searchByDate);
        break;
      case 'get_user_info':
        if (!args?.user_name) {
          throw new Error('user_name is required for get_user_info');
        }
        const userName = args.user_name;
        const userNumStories = args?.num_stories || DEFAULT_NUM_STORIES;
        result = await getUserInfo(userName, userNumStories);
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