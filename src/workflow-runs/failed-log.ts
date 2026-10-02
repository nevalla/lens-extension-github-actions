/** One line of a job's log, as shown: what it says, and whether GitHub marked it an error or a warning. */
export interface LogLine {
  readonly text: string;
  readonly kind: "error" | "warning" | "plain";
}

// "gh run view --log-failed" prints each line as "<job>\t<step>\t<timestamp> <text>", the first line of a
// step sometimes behind a byte-order mark, and the text with colours and GitHub's grouping markers in it.
const columns = /^[^\t]*\t[^\t]*\t\uFEFF?(?:\d{4}-\d{2}-\d{2}T[\d:.]+Z ?)?/;
const colours = /\u001b\[[0-9;]*m/g;
const groupMarkers = /^##\[(?:group|endgroup)\]/;
const marker = /^##\[(error|warning)\]/;

/** The last lines of a failed job's log, cleaned of what GitHub's own log view hides. */
export const failedLogLinesOf = (output: string, max = 50): LogLine[] =>
  output
    .split("\n")
    .map((line) => line.replace(columns, "").replace(colours, "").trimEnd())
    .filter((text) => text !== "" && !groupMarkers.test(text))
    .slice(-max)
    .map((text): LogLine => {
      const marked = text.match(marker);

      return marked
        ? { text: text.slice(marked[0].length), kind: marked[1] as LogLine["kind"] }
        : { text, kind: "plain" };
    });
