"use client";

import { useState, type FormEvent, type ReactNode } from "react";

import { Field, fieldAria } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { parseList } from "@/lib/format";
import { useActions } from "@/lib/store/use-actions";
import type { StarStory } from "@/types";

const STAR_FIELDS = [
  { key: "situation", label: "Situation" },
  { key: "task", label: "Task" },
  { key: "action", label: "Action" },
  { key: "result", label: "Result" },
] as const;

export function StarStoryDialog({ story, trigger }: { story?: StarStory; trigger: ReactNode }) {
  const { saveStarStory } = useActions();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(init);
  const [error, setError] = useState("");

  function init() {
    return {
      title: story?.title ?? "",
      situation: story?.situation ?? "",
      task: story?.task ?? "",
      action: story?.action ?? "",
      result: story?.result ?? "",
      themes: story?.themes.join(", ") ?? "",
    };
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!values.title.trim()) {
      setError("Give the story a short title.");
      return;
    }
    saveStarStory({ id: story?.id, ...values, title: values.title.trim(), themes: parseList(values.themes) });
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setValues(init());
          setError("");
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{story ? "Edit STAR story" : "New STAR story"}</DialogTitle>
          <DialogDescription>Situation, Task, Action, Result — reusable across interviews.</DialogDescription>
        </DialogHeader>
        <form id="star-form" onSubmit={handleSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="star-title" label="Title" required error={error} className="sm:col-span-2">
            <Input {...fieldAria("star-title", error)} value={values.title} onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))} />
          </Field>
          {STAR_FIELDS.map(({ key, label }) => (
            <Field key={key} id={`star-${key}`} label={label}>
              <Textarea id={`star-${key}`} rows={3} value={values[key]} onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))} />
            </Field>
          ))}
          <Field id="star-themes" label="Themes" hint="Comma-separated, e.g. Ownership, Conflict" className="sm:col-span-2">
            <Input {...fieldAria("star-themes", undefined, "hint")} value={values.themes} onChange={(e) => setValues((v) => ({ ...v, themes: e.target.value }))} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="star-form">
            {story ? "Save story" : "Add story"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
