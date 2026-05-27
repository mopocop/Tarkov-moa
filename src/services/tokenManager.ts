const TOKEN_KEY = 'tarkovtracker_token';

export class TokenManager {
  static saveToken(token: string): void {
    if (!this.validateToken(token)) {
      throw new Error('Invalid token format');
    }
    localStorage.setItem(TOKEN_KEY, token);
  }

  static getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  static clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
  }

  static hasToken(): boolean {
    return !!this.getToken();
  }

  static validateToken(token: string): boolean {
    // Basic validation: token should be non-empty and a reasonable length
    // TarkovTracker tokens are typically UUIDs or similar
    return typeof token === 'string' && token.length > 8 && token.length < 500;
  }

  static async verifyToken(token: string): Promise<boolean> {
    try {
      const response = await fetch('https://tarkovtracker.io/api/v2/token', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
