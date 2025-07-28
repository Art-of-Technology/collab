/**
 * URL Configuration
 * Configure the global URL resolver for different environments
 */

import { urlResolver } from './url-resolver';

// Configuration based on environment
export const configureUrls = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';

  urlResolver.configure({
    baseUrl: isProduction ? baseUrl : '',
    useTrailingSlash: false,
    locale: undefined // Ready for future i18n implementation
  });
};

// Auto-configure on import (for client-side)
if (typeof window !== 'undefined') {
  configureUrls();
}

// Export for manual configuration if needed
export { urlResolver } from './url-resolver'; 