import type { MCPServerConfig, MCPStorageData, MCPExportData } from "./types";
import { generateId } from "@/lib/utils";

const STORAGE_KEY = "mcp_servers";
const STORAGE_VERSION = 1;

/**
 * MCP Server Storage Service
 * Manages server configurations in localStorage
 */
export const mcpStorage = {
  /**
   * Get all stored server configs
   */
  getServers(): MCPServerConfig[] {
    if (typeof window === "undefined") return [];

    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];

      const parsed: MCPStorageData = JSON.parse(data);
      return parsed.servers ?? [];
    } catch (error) {
      console.error("Error reading MCP servers from storage:", error);
      return [];
    }
  },

  /**
   * Save all server configs
   */
  saveServers(servers: MCPServerConfig[]): void {
    if (typeof window === "undefined") return;

    try {
      const data: MCPStorageData = {
        servers,
        version: STORAGE_VERSION,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error("Error saving MCP servers to storage:", error);
    }
  },

  /**
   * Add a new server config
   */
  addServer(
    config: Omit<MCPServerConfig, "id" | "createdAt" | "updatedAt">
  ): MCPServerConfig {
    const now = Date.now();
    const newServer: MCPServerConfig = {
      ...config,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    };

    const servers = this.getServers();
    servers.push(newServer);
    this.saveServers(servers);

    return newServer;
  },

  /**
   * Update an existing server config
   */
  updateServer(
    id: string,
    updates: Partial<Omit<MCPServerConfig, "id" | "createdAt">>
  ): MCPServerConfig | null {
    const servers = this.getServers();
    const index = servers.findIndex((s) => s.id === id);

    if (index === -1) return null;

    const updated: MCPServerConfig = {
      ...servers[index],
      ...updates,
      updatedAt: Date.now(),
    };

    servers[index] = updated;
    this.saveServers(servers);

    return updated;
  },

  /**
   * Delete a server config
   */
  deleteServer(id: string): boolean {
    const servers = this.getServers();
    const filtered = servers.filter((s) => s.id !== id);

    if (filtered.length === servers.length) return false;

    this.saveServers(filtered);
    return true;
  },

  /**
   * Get a single server config by ID
   */
  getServer(id: string): MCPServerConfig | null {
    const servers = this.getServers();
    return servers.find((s) => s.id === id) ?? null;
  },

  /**
   * Export all server configs
   */
  exportServers(): MCPExportData {
    const servers = this.getServers();
    return {
      version: STORAGE_VERSION,
      exportedAt: Date.now(),
      servers: servers.map(({ name, transportType, stdioConfig, httpConfig, enabled }) => ({
        name,
        transportType,
        stdioConfig,
        httpConfig,
        enabled,
      })),
    };
  },

  /**
   * Import server configs
   */
  importServers(
    data: MCPExportData,
    options: { merge?: boolean } = {}
  ): MCPServerConfig[] {
    const { merge = true } = options;
    const now = Date.now();

    const importedServers: MCPServerConfig[] = data.servers.map((server) => ({
      ...server,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    }));

    if (merge) {
      const existingServers = this.getServers();
      const allServers = [...existingServers, ...importedServers];
      this.saveServers(allServers);
      return allServers;
    } else {
      this.saveServers(importedServers);
      return importedServers;
    }
  },

  /**
   * Clear all server configs
   */
  clearAll(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(STORAGE_KEY);
  },
};

