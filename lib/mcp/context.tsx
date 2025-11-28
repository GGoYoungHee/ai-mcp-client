"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { mcpStorage } from "./storage";
import type {
  MCPServerConfig,
  MCPServerStatus,
  MCPServerCapabilities,
  MCPApiResponse,
  MCPExportData,
} from "./types";

interface MCPContextValue {
  // Server configs
  servers: MCPServerConfig[];
  addServer: (config: Omit<MCPServerConfig, "id" | "createdAt" | "updatedAt">) => MCPServerConfig;
  updateServer: (id: string, updates: Partial<Omit<MCPServerConfig, "id" | "createdAt">>) => MCPServerConfig | null;
  deleteServer: (id: string) => boolean;
  
  // Connection management
  statuses: Map<string, MCPServerStatus>;
  connect: (serverId: string) => Promise<MCPServerStatus>;
  disconnect: (serverId: string) => Promise<MCPServerStatus>;
  
  // Capabilities
  capabilities: Map<string, MCPServerCapabilities>;
  refreshCapabilities: (serverId: string) => Promise<MCPServerCapabilities | null>;
  
  // Tool execution
  callTool: (serverId: string, toolName: string, args?: Record<string, unknown>) => Promise<unknown>;
  getPrompt: (serverId: string, promptName: string, args?: Record<string, string>) => Promise<unknown>;
  readResource: (serverId: string, uri: string) => Promise<unknown>;
  
  // Import/Export
  exportConfig: () => MCPExportData;
  importConfig: (data: MCPExportData, merge?: boolean) => void;
  
  // State
  isLoading: boolean;
}

const MCPContext = createContext<MCPContextValue | null>(null);

export function MCPProvider({ children }: { children: ReactNode }) {
  const [servers, setServers] = useState<MCPServerConfig[]>([]);
  const [statuses, setStatuses] = useState<Map<string, MCPServerStatus>>(new Map());
  const [capabilities, setCapabilities] = useState<Map<string, MCPServerCapabilities>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  // Sync server statuses from backend
  const syncStatuses = useCallback(async () => {
    try {
      const response = await fetch("/api/mcp/status");
      const result: MCPApiResponse<MCPServerStatus[]> = await response.json();
      
      if (result.success && result.data) {
        const statusMap = new Map<string, MCPServerStatus>();
        for (const status of result.data) {
          statusMap.set(status.serverId, status);
          
          // Also fetch capabilities for connected servers
          if (status.status === "connected") {
            try {
              const capResponse = await fetch(`/api/mcp/capabilities?serverId=${status.serverId}`);
              const capResult: MCPApiResponse<MCPServerCapabilities> = await capResponse.json();
              if (capResult.success && capResult.data) {
                setCapabilities((prev) => {
                  const next = new Map(prev);
                  next.set(status.serverId, capResult.data!);
                  return next;
                });
              }
            } catch (e) {
              console.error("Failed to fetch capabilities:", e);
            }
          }
        }
        setStatuses(statusMap);
      }
    } catch (error) {
      console.error("Failed to sync statuses:", error);
    }
  }, []);

  // Load servers from localStorage and sync statuses on mount
  useEffect(() => {
    const loadedServers = mcpStorage.getServers();
    setServers(loadedServers);
    
    // Sync connection statuses from server
    syncStatuses().finally(() => {
      setIsLoading(false);
    });
  }, [syncStatuses]);

  // Add server
  const addServer = useCallback((config: Omit<MCPServerConfig, "id" | "createdAt" | "updatedAt">) => {
    const newServer = mcpStorage.addServer(config);
    setServers((prev) => [...prev, newServer]);
    return newServer;
  }, []);

  // Update server
  const updateServer = useCallback((id: string, updates: Partial<Omit<MCPServerConfig, "id" | "createdAt">>) => {
    const updated = mcpStorage.updateServer(id, updates);
    if (updated) {
      setServers((prev) => prev.map((s) => (s.id === id ? updated : s)));
    }
    return updated;
  }, []);

  // Delete server
  const deleteServer = useCallback((id: string) => {
    const success = mcpStorage.deleteServer(id);
    if (success) {
      setServers((prev) => prev.filter((s) => s.id !== id));
      setStatuses((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setCapabilities((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    }
    return success;
  }, []);

  // Connect to server
  const connect = useCallback(async (serverId: string): Promise<MCPServerStatus> => {
    const server = servers.find((s) => s.id === serverId);
    if (!server) {
      return { serverId, status: "error", error: "Server not found" };
    }

    // Set connecting status
    setStatuses((prev) => {
      const next = new Map(prev);
      next.set(serverId, { serverId, status: "connecting" });
      return next;
    });

    try {
      const response = await fetch("/api/mcp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(server),
      });

      const result: MCPApiResponse<MCPServerStatus> = await response.json();

      if (result.success && result.data) {
        setStatuses((prev) => {
          const next = new Map(prev);
          next.set(serverId, result.data!);
          return next;
        });

        // Fetch capabilities if connected
        if (result.data.status === "connected") {
          await refreshCapabilities(serverId);
        }

        return result.data;
      } else {
        const errorStatus: MCPServerStatus = {
          serverId,
          status: "error",
          error: result.error ?? "Connection failed",
        };
        setStatuses((prev) => {
          const next = new Map(prev);
          next.set(serverId, errorStatus);
          return next;
        });
        return errorStatus;
      }
    } catch (error) {
      const errorStatus: MCPServerStatus = {
        serverId,
        status: "error",
        error: error instanceof Error ? error.message : "Connection failed",
      };
      setStatuses((prev) => {
        const next = new Map(prev);
        next.set(serverId, errorStatus);
        return next;
      });
      return errorStatus;
    }
  }, [servers]);

  // Disconnect from server
  const disconnect = useCallback(async (serverId: string): Promise<MCPServerStatus> => {
    try {
      const response = await fetch("/api/mcp/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId }),
      });

      const result: MCPApiResponse<MCPServerStatus> = await response.json();

      const status: MCPServerStatus = result.data ?? { serverId, status: "disconnected" };
      
      setStatuses((prev) => {
        const next = new Map(prev);
        next.set(serverId, status);
        return next;
      });

      setCapabilities((prev) => {
        const next = new Map(prev);
        next.delete(serverId);
        return next;
      });

      return status;
    } catch (error) {
      const status: MCPServerStatus = { serverId, status: "disconnected" };
      setStatuses((prev) => {
        const next = new Map(prev);
        next.set(serverId, status);
        return next;
      });
      return status;
    }
  }, []);

  // Refresh capabilities
  const refreshCapabilities = useCallback(async (serverId: string): Promise<MCPServerCapabilities | null> => {
    try {
      const response = await fetch(`/api/mcp/capabilities?serverId=${serverId}`);
      const result: MCPApiResponse<MCPServerCapabilities> = await response.json();

      if (result.success && result.data) {
        setCapabilities((prev) => {
          const next = new Map(prev);
          next.set(serverId, result.data!);
          return next;
        });
        return result.data;
      }
      return null;
    } catch (error) {
      console.error("Failed to refresh capabilities:", error);
      return null;
    }
  }, []);

  // Call tool
  const callTool = useCallback(async (serverId: string, toolName: string, args?: Record<string, unknown>) => {
    const response = await fetch("/api/mcp/tools/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serverId, toolName, arguments: args }),
    });

    const result: MCPApiResponse<unknown> = await response.json();

    if (!result.success) {
      throw new Error(result.error ?? "Tool call failed");
    }

    return result.data;
  }, []);

  // Get prompt
  const getPrompt = useCallback(async (serverId: string, promptName: string, args?: Record<string, string>) => {
    const response = await fetch("/api/mcp/prompts/get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serverId, promptName, arguments: args }),
    });

    const result: MCPApiResponse<unknown> = await response.json();

    if (!result.success) {
      throw new Error(result.error ?? "Get prompt failed");
    }

    return result.data;
  }, []);

  // Read resource
  const readResource = useCallback(async (serverId: string, uri: string) => {
    const response = await fetch("/api/mcp/resources/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serverId, uri }),
    });

    const result: MCPApiResponse<unknown> = await response.json();

    if (!result.success) {
      throw new Error(result.error ?? "Read resource failed");
    }

    return result.data;
  }, []);

  // Export config
  const exportConfig = useCallback(() => {
    return mcpStorage.exportServers();
  }, []);

  // Import config
  const importConfig = useCallback((data: MCPExportData, merge = true) => {
    const importedServers = mcpStorage.importServers(data, { merge });
    setServers(importedServers);
  }, []);

  const value: MCPContextValue = {
    servers,
    addServer,
    updateServer,
    deleteServer,
    statuses,
    connect,
    disconnect,
    capabilities,
    refreshCapabilities,
    callTool,
    getPrompt,
    readResource,
    exportConfig,
    importConfig,
    isLoading,
  };

  return <MCPContext.Provider value={value}>{children}</MCPContext.Provider>;
}

export function useMCP() {
  const context = useContext(MCPContext);
  if (!context) {
    throw new Error("useMCP must be used within an MCPProvider");
  }
  return context;
}

