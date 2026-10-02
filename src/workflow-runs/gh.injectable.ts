import { runCliCommandInjectionToken } from "@k8slens/cli-contracts";
import { getInjectable2 } from "@k8slens/injectable";

// Anything gh writes to standard error fails the command, so keep its notices quiet.
const ghEnv = { GH_NO_UPDATE_NOTIFIER: "1", GH_PROMPT_DISABLED: "1", NO_COLOR: "1" };

/** Runs the GitHub CLI with the arguments given, quoted by the caller, and answers with what it printed. */
export const ghInjectable = getInjectable2({
  id: "github-actions-gh",
  consumptions: [runCliCommandInjectionToken],

  instantiate: (di) => {
    const runCliCommand = di.inject(runCliCommandInjectionToken)();

    return () => (args: string) => runCliCommand(`gh ${args}`, { env: ghEnv });
  },
});
