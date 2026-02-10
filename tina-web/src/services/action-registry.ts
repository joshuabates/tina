export type ActionScope = `global` | `section:${string}` | `modal:${string}`;

export interface ActionContext {
  readonly scope: ActionScope;
  readonly selectedId?: string;
}

export interface ActionDescriptor {
  readonly id: string;
  readonly label: string;
  readonly keybinding: string;
  readonly scope: ActionScope;
  readonly priority: number;
  readonly execute: (context: ActionContext) => void;
}

function bindingKey(scope: ActionScope, keybinding: string): string {
  return `${scope}::${keybinding.toLowerCase()}`;
}

/**
 * Review draft:
 * - Duplicate keybindings in the same scope are rejected.
 * - Exactly one action per (scope, keybinding).
 * - register() returns cleanup to support React StrictMode mount/unmount cycles.
 */
export class ActionRegistry {
  private readonly byId = new Map<string, ActionDescriptor>();
  private readonly byBinding = new Map<string, string>();

  register(action: ActionDescriptor): () => void {
    const existing = this.byId.get(action.id);
    if (existing) {
      const sameDefinition =
        existing.scope === action.scope &&
        existing.keybinding === action.keybinding &&
        existing.priority === action.priority;
      if (!sameDefinition) {
        throw new Error(
          `Action "${action.id}" already registered with a different definition`,
        );
      }
      return () => this.unregister(action.id);
    }

    const key = bindingKey(action.scope, action.keybinding);
    const boundActionId = this.byBinding.get(key);
    if (boundActionId) {
      throw new Error(
        `Action conflict for ${key}: already assigned to "${boundActionId}"`,
      );
    }

    this.byBinding.set(key, action.id);
    this.byId.set(action.id, action);

    return () => this.unregister(action.id);
  }

  unregister(actionId: string): void {
    const action = this.byId.get(actionId);
    if (!action) return;

    const key = bindingKey(action.scope, action.keybinding);
    const boundActionId = this.byBinding.get(key);
    if (boundActionId === actionId) {
      this.byBinding.delete(key);
    }
    this.byId.delete(actionId);
  }

  dispatch(scope: ActionScope, keybinding: string, context: ActionContext): boolean {
    const key = bindingKey(scope, keybinding);
    const actionId = this.byBinding.get(key);
    if (!actionId) return false;
    const candidate = this.byId.get(actionId);
    if (!candidate) return false;
    candidate.execute(context);
    return true;
  }

  list(scope?: ActionScope): ActionDescriptor[] {
    const values = Array.from(this.byId.values());
    if (!scope) return values;
    return values.filter((action) => action.scope === scope);
  }
}
