# GitHub OAuth Integration Setup

This guide will help you set up GitHub OAuth integration for seamless repository connection in your Collab project.

## 🚀 **What You Get**

- **One-click repository connection** (no more manual repo ID hunting!)
- **Automatic webhook setup** (no more GitHub settings navigation!)
- **Repository browser** with search and filtering
- **Permission validation** (ensures you can actually connect the repo)
- **Visual status indicators** (see which repos are already connected)

## 📋 **Prerequisites**

1. A GitHub account with access to repositories you want to connect
2. Admin access to repositories (required for webhook creation)
3. Your Collab application deployed and accessible

## 🔧 **Setup Steps**

### **Step 1: Create a GitHub OAuth App**

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **"New OAuth App"**
3. Fill in the details:
   ```
   Application name: Collab Integration
   Homepage URL: https://your-collab-domain.com
   Application description: Project management integration with GitHub
   Authorization callback URL: https://your-collab-domain.com/api/github/oauth/callback
   ```
4. Click **"Register application"**
5. Copy the **Client ID** and generate a **Client Secret**

### **Step 2: Configure Environment Variables**

Add these variables to your `.env` file:

```env
# GitHub OAuth Configuration
GITHUB_CLIENT_ID=your_github_client_id_here
GITHUB_CLIENT_SECRET=your_github_client_secret_here

# Make sure NEXTAUTH_URL is set correctly
NEXTAUTH_URL=https://your-collab-domain.com
```

### **Step 3: Deploy and Test**

1. Deploy your application with the new environment variables
2. Go to any project settings page
3. Navigate to the "GitHub Integration" section
4. Click **"Connect with GitHub"**
5. Authorize the application
6. Select a repository from the list
7. Click **"Connect"** - webhook will be created automatically!

## 🎯 **How It Works**

### **OAuth Flow**
```
User clicks "Connect with GitHub"
    ↓
Opens GitHub OAuth popup
    ↓
User authorizes application
    ↓
GitHub redirects to callback
    ↓
Store access token in database
    ↓
Fetch user's repositories
    ↓
Display repository selector
```

### **Repository Connection**
```
User selects repository
    ↓
Validate user has admin access
    ↓
Create webhook in GitHub repo
    ↓
Store repository connection in database
    ↓
Initialize default version (0.0.0)
    ↓
Ready for version tracking!
```

## 🔒 **Security Considerations**

1. **Access Tokens**: Currently stored in plain text. In production, encrypt them using a service like AWS KMS or similar.

2. **Webhook Secrets**: Generated randomly and used to verify webhook authenticity.

3. **Permissions**: Only users with admin access to repositories can connect them.

4. **Scopes**: The OAuth app requests these permissions:
   - `repo`: Full repository access (needed for webhooks)
   - `read:user`: Read user profile
   - `user:email`: Read user email
   - `admin:repo_hook`: Manage webhooks

## 🛠️ **Troubleshooting**

### **"GitHub account not connected" Error**
- User needs to complete OAuth flow first
- Check if `githubAccessToken` is stored in user record

### **"You need admin access" Error**
- User must have admin permissions on the repository
- Repository owner needs to grant admin access

### **"Hook already exists" Error**
- Webhook URL already configured for this repository
- Check GitHub repository webhook settings
- Delete existing webhook and try again

### **"Repository not found" Error**
- Repository might be private and user doesn't have access
- Check repository name and owner are correct
- Verify OAuth token has correct permissions

## 🎨 **UI Features**

### **Repository Browser**
- **Search**: Find repositories by name or description
- **Filters**: Show only accessible repositories
- **Status Indicators**: See which repos are already connected
- **Permission Badges**: Visual indication of access level
- **Metadata**: Stars, language, last updated, default branch

### **Connection Status**
- **Connected**: Green checkmark with project name
- **No Access**: Gray indicator with explanation
- **Available**: Blue "Connect" button

### **Fallback Options**
- Manual setup option (currently disabled)
- Clear error messages with actionable advice
- Retry mechanisms for failed operations

## 📈 **What's Next**

After connecting repositories, users can:
- View GitHub integration status in issue detail pages
- See pull requests, commits, and CI/CD checks
- Track version progression across environments
- Access AI-enhanced changelogs
- Monitor deployment status

## 🔄 **Migration from Manual Setup**

If you have repositories connected via the old manual method:
1. They will continue to work normally
2. Webhooks are already configured
3. No migration needed
4. New connections will use OAuth flow

---

**Need Help?** Check the troubleshooting section above or contact your development team.

