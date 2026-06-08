import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User } from '../types/index';
import { UserRole } from '../types/index';
import { authApi } from '../services/api';
import { authStorage } from '../utils/authStorage';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    // Initialize from configured auth storage for immediate access
    return authStorage.getUser<User>();
  });
  const [isLoading, setIsLoading] = useState(true);

  const login = useCallback((token: string, userData: User) => {
    authStorage.setToken(token);
    authStorage.setUser(userData as unknown as Record<string, unknown>);
    setUser(userData);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (error) {
      // Ignore logout errors
    }
    authStorage.clearAuth();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const token = authStorage.getToken();
    if (!token) {
      authStorage.removeUser();
      setUser(null);
      setIsLoading(false);
      return;
    }

    // Try to get user from auth storage first for immediate render
    const storedUser = authStorage.getUser<User>();
    if (storedUser && !user) {
      setUser(storedUser);
    }

    try {
      const response: any = await authApi.getCurrentUser();
      if (response.success && response.data) {
        setUser(response.data);
        authStorage.setUser(response.data as Record<string, unknown>);
      } else {
        // Keep stored user if API returns no data but token exists
        if (!storedUser) {
          authStorage.clearAuth();
          setUser(null);
        }
      }
    } catch (error) {
      // Keep stored user if API fails but token exists
      if (!storedUser) {
        authStorage.clearAuth();
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, []); // Empty dependency array - only creates function once

  const updateUser = useCallback((userData: User) => {
    setUser(userData);
    authStorage.setUser(userData as unknown as Record<string, unknown>);
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    refreshUser,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Helper hook to check roles
export function useRole() {
  const { user } = useAuth();
  
  return {
    isCitizen: user?.role === UserRole.CITIZEN,
    isLawyer: user?.role === UserRole.LAWYER,
    isAdmin: user?.role === UserRole.ADMIN,
    role: user?.role,
  };
}

// Protected route helper
export function useRequireAuth(allowedRoles?: UserRole[]) {
  const { user, isLoading, isAuthenticated } = useAuth();

  const isAllowed = !allowedRoles || (user && allowedRoles.includes(user.role));

  return {
    isLoading,
    isAuthenticated,
    isAllowed,
    user,
  };
}
