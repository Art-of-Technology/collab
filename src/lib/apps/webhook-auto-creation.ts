import { PrismaClient } from '@prisma/client';
import { AppManifestV1 } from './types';
import { 
  generateWebhookSecret, 
  isValidWebhookUrl, 
  validateEventTypes 
} from '../webhooks';
import { encrypt } from './crypto';

const prisma = new PrismaClient();

export interface WebhookCreationResult {
  success: boolean;
  webhooksCreated: number;
  errors: string[];
  webhookSecrets: Array<{
    webhookId: string;
    url: string;
    secret: string;
    eventTypes: string[];
  }>;
}

/**
 * Automatically create webhooks for an app installation based on manifest configuration
 */
export async function createWebhooksFromManifest(
  installationId: string,
  appId: string,
  manifest: AppManifestV1
): Promise<WebhookCreationResult> {
  const result: WebhookCreationResult = {
    success: true,
    webhooksCreated: 0,
    errors: [],
    webhookSecrets: []
  };

  try {
    // Check if manifest has webhook configuration
    if (!manifest.webhooks?.endpoints || manifest.webhooks.endpoints.length === 0) {
      console.log(`📝 No webhook endpoints defined in manifest for app ${appId}`);
      return result;
    }

    console.log(`🪝 Auto-creating ${manifest.webhooks.endpoints.length} webhooks for installation ${installationId}`);

    // Process each webhook endpoint
    for (const [index, endpoint] of manifest.webhooks.endpoints.entries()) {
      try {
        // Validate webhook URL
        if (!isValidWebhookUrl(endpoint.url)) {
          const error = `Invalid webhook URL: ${endpoint.url}. Must be HTTPS in production.`;
          result.errors.push(error);
          console.warn(`⚠️ ${error}`);
          continue;
        }

        // Validate event types
        if (!validateEventTypes(endpoint.events)) {
          const error = `Invalid event types for endpoint ${index + 1}: ${endpoint.events.join(', ')}`;
          result.errors.push(error);
          console.warn(`⚠️ ${error}`);
          continue;
        }

        // Check if webhook URL already exists for this installation
        const existingWebhook = await prisma.appWebhook.findUnique({
          where: {
            installationId_url: {
              installationId,
              url: endpoint.url
            }
          }
        });

        if (existingWebhook) {
          const warning = `Webhook URL already exists: ${endpoint.url}`;
          result.errors.push(warning);
          console.warn(`⚠️ ${warning}`);
          continue;
        }

        // Generate webhook secret
        const secret = generateWebhookSecret();
        const encryptedSecret = await encrypt(secret);

        // Create webhook record
        const webhook = await prisma.appWebhook.create({
          data: {
            appId,
            installationId,
            url: endpoint.url,
            secretEnc: encryptedSecret,
            eventTypes: endpoint.events,
            isActive: true
          }
        });

        result.webhooksCreated++;
        
        // Store the webhook secret for returning to the third-party app
        result.webhookSecrets.push({
          webhookId: webhook.id,
          url: endpoint.url,
          secret: secret, // Return the plain-text secret
          eventTypes: endpoint.events
        });
        
        console.log(`✅ Created webhook ${webhook.id}`, {
          url: endpoint.url,
          events: endpoint.events,
          installationId
        });

      } catch (endpointError: any) {
        const error = `Failed to create webhook for ${endpoint.url}: ${endpointError.message}`;
        result.errors.push(error);
        console.error(`❌ ${error}`, endpointError);
      }
    }

    // Set overall success based on whether any webhooks were created successfully
    result.success = result.webhooksCreated > 0 || result.errors.length === 0;

    console.log(`🪝 Webhook auto-creation completed for installation ${installationId}`, {
      created: result.webhooksCreated,
      errors: result.errors.length,
      success: result.success
    });

  } catch (error: any) {
    result.success = false;
    result.errors.push(`Webhook auto-creation failed: ${error.message}`);
    console.error(`❌ Failed to auto-create webhooks for installation ${installationId}`, error);
  }

  return result;
}

/**
 * Get webhook endpoints from app manifest
 */
export function getWebhookEndpointsFromManifest(manifest: AppManifestV1) {
  return manifest.webhooks?.endpoints || [];
}

/**
 * Validate webhook configuration in manifest
 */
export function validateWebhookManifest(manifest: AppManifestV1): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!manifest.webhooks) {
    return { valid: true, errors: [] }; // No webhooks is valid
  }

  if (!manifest.webhooks.endpoints || !Array.isArray(manifest.webhooks.endpoints)) {
    errors.push('webhooks.endpoints must be an array');
    return { valid: false, errors };
  }

  for (const [index, endpoint] of manifest.webhooks.endpoints.entries()) {
    const prefix = `webhooks.endpoints[${index}]`;

    if (!endpoint.url || typeof endpoint.url !== 'string') {
      errors.push(`${prefix}.url is required and must be a string`);
    } else if (!isValidWebhookUrl(endpoint.url)) {
      errors.push(`${prefix}.url must be a valid HTTPS URL (HTTP allowed in development)`);
    }

    if (!endpoint.events || !Array.isArray(endpoint.events) || endpoint.events.length === 0) {
      errors.push(`${prefix}.events is required and must be a non-empty array`);
    } else if (!validateEventTypes(endpoint.events)) {
      errors.push(`${prefix}.events contains invalid event types`);
    }

    if (endpoint.signature) {
      if (!endpoint.signature.type || !['HMAC_SHA256', 'JWS', 'HTTP_SIGNATURE'].includes(endpoint.signature.type)) {
        errors.push(`${prefix}.signature.type must be one of: HMAC_SHA256, JWS, HTTP_SIGNATURE`);
      }

      if (!endpoint.signature.header || typeof endpoint.signature.header !== 'string') {
        errors.push(`${prefix}.signature.header is required and must be a string`);
      }
    }

    if (endpoint.tolerance_seconds !== undefined) {
      if (typeof endpoint.tolerance_seconds !== 'number' || endpoint.tolerance_seconds < 0) {
        errors.push(`${prefix}.tolerance_seconds must be a positive number`);
      }
    }

    if (endpoint.retries) {
      if (typeof endpoint.retries.max !== 'number' || endpoint.retries.max < 0) {
        errors.push(`${prefix}.retries.max must be a positive number`);
      }

      if (!['exponential', 'fixed'].includes(endpoint.retries.backoff)) {
        errors.push(`${prefix}.retries.backoff must be 'exponential' or 'fixed'`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
