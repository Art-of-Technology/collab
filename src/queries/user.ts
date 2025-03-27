// Simple function to get the current user profile
export const getProfile = async () => {
  try {
    const response = await fetch('/api/user/me', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch profile');
    }

    const data = await response.json();
    return data.user;
  } catch (error) {
    console.error('Error fetching profile:', error);
    return null;
  }
}; 