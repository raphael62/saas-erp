"use client";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type TemplateItem = {
  id: string;
  name: string;
  is_default?: boolean | null;
  authorization_group?: string | null;
};

type ProductTemplateListDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: TemplateItem[];
  selectedTemplateId: string | null;
  onSelectTemplate: (templateId: string) => void;
  onOpenTemplateSettings: (templateId: string) => void;
  onCreateTemplate: () => void;
};

export function ProductTemplateListDialog({
  open,
  onOpenChange,
  templates,
  selectedTemplateId,
  onSelectTemplate,
  onOpenTemplateSettings,
  onCreateTemplate,
}: ProductTemplateListDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Template List" showGearIcon={false} contentClassName="max-w-lg text-sm">
      <div className="space-y-3">
        <div className="max-h-72 overflow-auto rounded border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40">
                <th className="px-2 py-2 text-left font-medium">Name</th>
                <th className="px-2 py-2 text-left font-medium">Default</th>
                <th className="px-2 py-2 text-left font-medium">Group</th>
              </tr>
            </thead>
            <tbody>
              {templates.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-2 py-4 text-center text-muted-foreground">
                    No templates yet.
                  </td>
                </tr>
              ) : (
                templates.map((t) => (
                  <tr
                    key={t.id}
                    className={`cursor-pointer border-t border-border hover:bg-muted/40 ${selectedTemplateId === t.id ? "bg-muted/50" : ""}`}
                    onClick={() => onSelectTemplate(t.id)}
                    onDoubleClick={() => onOpenTemplateSettings(t.id)}
                  >
                    <td className="px-2 py-2">{t.name}</td>
                    <td className="px-2 py-2">{t.is_default ? "Yes" : "No"}</td>
                    <td className="px-2 py-2">{t.authorization_group ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCreateTemplate}>
            New
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!selectedTemplateId}
            onClick={() => selectedTemplateId && onOpenTemplateSettings(selectedTemplateId)}
          >
            Open
          </Button>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

