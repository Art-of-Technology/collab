#!/usr/bin/env node

/**
 * Generate Cursor install links for Collab MCP Server
 * 
 * This script generates various install links for different deployment scenarios
 */

function generateInstallLink(name, config) {
  const configString = JSON.stringify(config);
  const base64Config = Buffer.from(configString).toString('base64');
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${name}&config=${base64Config}`;
}

function generateWebLink(name, config) {
  const configString = JSON.stringify(config);
  const base64Config = Buffer.from(configString).toString('base64');
  return `https://cursor.sh/mcp-install?name=${name}&config=${base64Config}`;
}

function generateMarkdownButton(text, link, style = 'dark') {
  const color = style === 'dark' ? '000000' : 'ffffff';
  const bg = style === 'dark' ? 'ffffff' : '000000';
  
  return `[![${text}](https://img.shields.io/badge/${encodeURIComponent(text)}-${color}?style=for-the-badge&logo=cursor&logoColor=${bg})](${link})`;
}

function generateHTMLButton(text, link, style = 'dark') {
  const bgColor = style === 'dark' ? '#000000' : '#ffffff';
  const textColor = style === 'dark' ? '#ffffff' : '#000000';
  
  return `<a href="${link}" style="display: inline-block; padding: 12px 24px; background-color: ${bgColor}; color: ${textColor}; text-decoration: none; border-radius: 6px; font-weight: bold; border: 2px solid #007ACC;">
  ${text}
</a>`;
}

// Different configuration scenarios
const configs = {
  // Basic configuration for local development
  local: {
    "collab": {
      "command": "npx",
      "args": ["-y", "collab-mcp-server"],
      "env": {
        "COLLAB_API_URL": "http://localhost:3000"
      }
    }
  },

  // Production configuration
  production: {
    "collab": {
      "command": "npx", 
      "args": ["-y", "collab-mcp-server"],
      "env": {
        "COLLAB_API_URL": "https://your-collab-app.com"
      }
    }
  },

  // Development with custom API key
  development: {
    "collab": {
      "command": "npx",
      "args": ["-y", "collab-mcp-server"],
      "env": {
        "COLLAB_API_URL": "http://localhost:3000",
        "COLLAB_API_KEY": "your_api_key_here"
      }
    }
  },

  // Using local build (for development)
  localBuild: {
    "collab": {
      "command": "node",
      "args": ["./mcp-server/dist/index.js"],
      "env": {
        "COLLAB_API_URL": "http://localhost:3000"
      }
    }
  }
};

console.log('# Collab MCP Server - Cursor Install Links\n');

Object.entries(configs).forEach(([scenario, config]) => {
  const deepLink = generateInstallLink('collab', config);
  const webLink = generateWebLink('collab', config);
  const markdownDark = generateMarkdownButton(`Add Collab MCP (${scenario})`, deepLink, 'dark');
  const markdownLight = generateMarkdownButton(`Add Collab MCP (${scenario})`, deepLink, 'light');
  const htmlDark = generateHTMLButton(`Add Collab MCP (${scenario})`, deepLink, 'dark');
  
  console.log(`## ${scenario.charAt(0).toUpperCase() + scenario.slice(1)} Configuration\n`);
  console.log('**Configuration:**');
  console.log('```json');
  console.log(JSON.stringify(config, null, 2));
  console.log('```\n');
  
  console.log('**Install Links:**');
  console.log(`- **Direct Link:** ${deepLink}`);
  console.log(`- **Web Link:** ${webLink}\n`);
  
  console.log('**Markdown Buttons:**');
  console.log('```markdown');
  console.log(markdownDark);
  console.log(markdownLight);
  console.log('```\n');
  
  console.log('**HTML Button:**');
  console.log('```html');
  console.log(htmlDark);
  console.log('```\n');
  
  console.log('---\n');
});

console.log('## Quick Copy-Paste for README\n');
console.log('### Local Development');
console.log(`**[🚀 Add Collab MCP Server to Cursor](${generateInstallLink('collab', configs.local)})**\n`);

console.log('### Production');
console.log(`**[🚀 Add Collab MCP Server to Cursor](${generateInstallLink('collab', configs.production)})**\n`);

console.log('## Manual Configuration\n');
console.log('If the install links don\'t work, manually add this to your Cursor MCP settings:\n');
console.log('```json');
console.log(JSON.stringify(configs.local, null, 2));
console.log('```\n');

console.log('## Environment Variables\n');
console.log('Make sure these environment variables are set:\n');
console.log('```bash');
console.log('COLLAB_API_URL=http://localhost:3000  # Your Collab app URL');
console.log('COLLAB_API_KEY=your_api_key_here      # Optional API key');
console.log('```\n');

console.log('Generated at:', new Date().toISOString()); 