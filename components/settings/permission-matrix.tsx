"use client";

import React, { useState, useCallback, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getNavIcon } from "@/components/dashboard/nav-icons";
import { permissionTree } from "@/lib/permissions-config";
import type { PermissionRow } from "@/app/dashboard/settings/roles-permissions/actions";

type PermState = {
  moduleKey: string;
  pageKey: string | null;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_export: boolean;
  is_full: boolean;
};

function permKey(m: string, p: string | null) {
  return `${m}:${p ?? ""}`;
}

function toPermState(p: PermissionRow): PermState {
  return {
    moduleKey: p.module_key,
    pageKey: p.page_key,
    can_view: p.can_view,
    can_create: p.can_create,
    can_edit: p.can_edit,
    can_delete: p.can_delete,
    can_export: p.can_export,
    is_full: p.is_full,
  };
}

type Props = {
  permissions: PermissionRow[];
  onChange: (permissions: Omit<PermissionRow, "id">[]) => void;
  onSave: (permissions: Omit<PermissionRow, "id">[]) => Promise<void>;
  saving?: boolean;
};

export function PermissionMatrix({ permissions, onChange, onSave, saving }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(permissionTree.map((n) => n.moduleKey)));
  const initState = useCallback((perms: PermissionRow[]) => {
    const m = new Map<string, PermState>();
    for (const p of perms) {
      m.set(permKey(p.module_key, p.page_key), toPermState(p));
    }
    for (const node of permissionTree) {
      const key = permKey(node.moduleKey, null);
      if (!m.has(key)) m.set(key, { moduleKey: node.moduleKey, pageKey: null, can_view: false, can_create: false, can_edit: false, can_delete: false, can_export: false, is_full: false });
      for (const ch of node.children ?? []) {
        const ckey = permKey(node.moduleKey, ch.pageKey);
        if (!m.has(ckey)) m.set(ckey, { moduleKey: node.moduleKey, pageKey: ch.pageKey, can_view: false, can_create: false, can_edit: false, can_delete: false, can_export: false, is_full: false });
      }
    }
    return m;
  }, []);

  const [state, setState] = useState<Map<string, PermState>>(() => initState(permissions));

  useEffect(() => {
    setState(initState(permissions));
  }, [permissions, initState]);

  const update = useCallback(
    (key: string, upd: Partial<PermState>) => {
      setState((prev) => {
        const next = new Map(prev);
        const cur = next.get(key) ?? {
          moduleKey: key.split(":")[0],
          pageKey: key.endsWith(":") ? null : key.split(":")[1] || null,
          can_view: false,
          can_create: false,
          can_edit: false,
          can_delete: false,
          can_export: false,
          is_full: false,
        };
        next.set(key, { ...cur, ...upd });
        return next;
      });
    },
    []
  );

  const toggleExpand = (moduleKey: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(moduleKey)) next.delete(moduleKey);
      else next.add(moduleKey);
      return next;
    });
  };

  const setAllActions = (key: string, val: boolean, isModuleRow: boolean) => {
    const k = key;
    if (isModuleRow) {
      update(k, { is_full: val });
    } else {
      update(k, {
        can_view: val,
        can_create: val,
        can_edit: val,
        can_delete: val,
        can_export: val,
        is_full: val,
      });
    }
  };

  const setAll = (key: string, val: boolean, isModuleRow: boolean) => {
    if (isModuleRow) {
      update(key, { is_full: val });
    } else {
      update(key, {
        can_view: val,
        can_create: val,
        can_edit: val,
        can_delete: val,
        can_export: val,
      });
    }
  };

  const getPerm = (moduleKey: string, pageKey: string | null) =>
    state.get(permKey(moduleKey, pageKey)) ?? {
      moduleKey,
      pageKey,
      can_view: false,
      can_create: false,
      can_edit: false,
      can_delete: false,
      can_export: false,
      is_full: false,
    };

  const allChecked = (p: PermState, isModule: boolean) =>
    isModule ? p.is_full : p.can_view && p.can_create && p.can_edit && p.can_delete && p.can_export;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Select a module for full section access. Expand to configure individual pages.
      </p>
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-2 text-left font-medium">Module / Page</th>
              <th className="w-14 px-1 py-2 text-center font-medium">View</th>
              <th className="w-14 px-1 py-2 text-center font-medium">Create</th>
              <th className="w-14 px-1 py-2 text-center font-medium">Edit</th>
              <th className="w-14 px-1 py-2 text-center font-medium">Delete</th>
              <th className="w-14 px-1 py-2 text-center font-medium">Export</th>
              <th className="w-14 px-1 py-2 text-center font-medium">All</th>
              <th className="w-14 px-1 py-2 text-center font-medium">Full</th>
            </tr>
          </thead>
          <tbody>
            {permissionTree.map((node) => {
              const modKey = permKey(node.moduleKey, null);
              const modPerm = getPerm(node.moduleKey, null);
              const isExp = expanded.has(node.moduleKey);
              const hasChildren = (node.children?.length ?? 0) > 0;

              return (
                <React.Fragment key={modKey}>
                  <tr key={modKey} className="border-b border-border">
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => hasChildren && toggleExpand(node.moduleKey)}
                          className="rounded p-0.5 hover:bg-muted"
                          aria-label={isExp ? "Collapse" : "Expand"}
                        >
                          {hasChildren ? (
                            isExp ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )
                          ) : (
                            <span className="w-4" />
                          )}
                        </button>
                        {(() => {
                          const Icon = getNavIcon(node.iconKey);
                          return <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />;
                        })()}
                        <span className="font-medium">{node.label}</span>
                      </div>
                    </td>
                    <td className="px-1 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={modPerm.can_view}
                        onChange={(e) => update(modKey, { can_view: e.target.checked })}
                        className="h-4 w-4 rounded border-input"
                      />
                    </td>
                    <td className="px-1 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={modPerm.can_create}
                        onChange={(e) => update(modKey, { can_create: e.target.checked })}
                        className="h-4 w-4 rounded border-input"
                      />
                    </td>
                    <td className="px-1 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={modPerm.can_edit}
                        onChange={(e) => update(modKey, { can_edit: e.target.checked })}
                        className="h-4 w-4 rounded border-input"
                      />
                    </td>
                    <td className="px-1 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={modPerm.can_delete}
                        onChange={(e) => update(modKey, { can_delete: e.target.checked })}
                        className="h-4 w-4 rounded border-input"
                      />
                    </td>
                    <td className="px-1 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={modPerm.can_export}
                        onChange={(e) => update(modKey, { can_export: e.target.checked })}
                        className="h-4 w-4 rounded border-input"
                      />
                    </td>
                    <td className="px-1 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={allChecked(modPerm, true)}
                        onChange={(e) => setAll(modKey, e.target.checked, true)}
                        className="h-4 w-4 rounded border-input"
                      />
                    </td>
                    <td className="px-1 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={modPerm.is_full}
                        onChange={(e) => setAllActions(modKey, e.target.checked, true)}
                        className="h-4 w-4 rounded border-input"
                      />
                    </td>
                  </tr>
                  {isExp &&
                    (node.children ?? []).map((ch) => {
                      const ckey = permKey(node.moduleKey, ch.pageKey);
                      const cp = getPerm(node.moduleKey, ch.pageKey);
                      return (
                        <tr key={ckey} className="border-b border-border bg-muted/20">
                          <td className="px-3 py-1.5 pl-10">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              {(() => {
                                const Icon = getNavIcon(ch.iconKey);
                                return <Icon className="h-4 w-4 shrink-0" />;
                              })()}
                              {ch.label}
                            </div>
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={cp.can_view}
                              onChange={(e) => update(ckey, { can_view: e.target.checked })}
                              className="h-4 w-4 rounded border-input"
                            />
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={cp.can_create}
                              onChange={(e) => update(ckey, { can_create: e.target.checked })}
                              className="h-4 w-4 rounded border-input"
                            />
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={cp.can_edit}
                              onChange={(e) => update(ckey, { can_edit: e.target.checked })}
                              className="h-4 w-4 rounded border-input"
                            />
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={cp.can_delete}
                              onChange={(e) => update(ckey, { can_delete: e.target.checked })}
                              className="h-4 w-4 rounded border-input"
                            />
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={cp.can_export}
                              onChange={(e) => update(ckey, { can_export: e.target.checked })}
                              className="h-4 w-4 rounded border-input"
                            />
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={allChecked(cp, false)}
                              onChange={(e) => setAll(ckey, e.target.checked, false)}
                              className="h-4 w-4 rounded border-input"
                            />
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={cp.is_full}
                              onChange={(e) => setAllActions(ckey, e.target.checked, false)}
                              className="h-4 w-4 rounded border-input"
                            />
                          </td>
                        </tr>
                      );
                    })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <Button
          className="bg-[var(--navbar)] text-[var(--navbar-foreground)] hover:opacity-90"
          onClick={async () => {
            const out: Omit<PermissionRow, "id">[] = [];
            state.forEach((v) => {
              if (v.can_view || v.can_create || v.can_edit || v.can_delete || v.can_export || v.is_full) {
                out.push({
                  module_key: v.moduleKey,
                  page_key: v.pageKey,
                  can_view: v.can_view,
                  can_create: v.can_create,
                  can_edit: v.can_edit,
                  can_delete: v.can_delete,
                  can_export: v.can_export,
                  is_full: v.is_full,
                });
              }
            });
            onChange(out);
            await onSave(out);
          }}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
