import { useState } from "react";
import { createProject } from "../api";

interface Props {
  onCreated: () => void;
}

export default function AddProjectForm({ onCreated }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!expanded) {
    return (
      <button
        data-testid="add-project-toggle"
        onClick={() => setExpanded(true)}
        className="text-sm text-cyan-400 hover:underline"
      >
        + Add Project
      </button>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !repoPath.trim()) return;

    setSubmitting(true);
    setError(null);
    createProject(name.trim(), repoPath.trim())
      .then(() => {
        setName("");
        setRepoPath("");
        setExpanded(false);
        onCreated();
      })
      .catch((err: Error) => {
        setError(err.message);
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  return (
    <form data-testid="add-project-form" onSubmit={handleSubmit} className="bg-gray-900 rounded-lg p-4 max-w-md">
      <h3 className="text-sm font-semibold text-gray-400 mb-3">Add Project</h3>
      <div className="space-y-2">
        <input
          type="text"
          placeholder="Project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-gray-800 text-sm rounded px-3 py-1.5 border border-gray-700 focus:border-cyan-400 focus:outline-none"
        />
        <input
          type="text"
          placeholder="Repository path"
          value={repoPath}
          onChange={(e) => setRepoPath(e.target.value)}
          className="w-full bg-gray-800 text-sm rounded px-3 py-1.5 border border-gray-700 focus:border-cyan-400 focus:outline-none font-mono"
        />
      </div>
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      <div className="flex gap-2 mt-3">
        <button
          type="submit"
          disabled={submitting}
          className="text-sm bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1 rounded disabled:opacity-50"
        >
          {submitting ? "Creating..." : "Create"}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-sm text-gray-400 hover:text-gray-300 px-3 py-1"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
