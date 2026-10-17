import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsxEdges, validateSpec } from "../src/validate/index.js";

const md = (component: string, contract: string, story: string) => `---
component: ${component}
ds_version: test@1.0.0
status: Draft
last_verified: 2026-06-01
category: Component
required_aria: []
semantic_parts:
  root: the element
${contract}
token_contract: []
interaction_states: [default]
checks:
  aria_correct: false
  structure_correct: false
  states_complete: false
  tokens_valid: false
  no_invented_styles: false
sources:
  storybook:
    path: ${story}
---
`;

async function fixture(component: string, contract: string, storyContents: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "agspec-nesting-"));
  const story = join(dir, "X.stories.tsx");
  await writeFile(story, storyContents);
  await writeFile(join(dir, "index.md"), md(component, contract, story));
  await writeFile(join(dir, "tokens.json"), JSON.stringify({ component, tokens: [] }));
  return dir;
}

const nesting = (r: { findings: { rule: string; message: string }[] }) =>
  r.findings.filter((f) => f.rule === "slot-nesting");

const TABLE = `nesting:
  Table: [TableThead, TableTbody]
  TableThead: [TableTr]
  TableTbody: [TableTr]
  TableTr: [TableTh, TableTd]`;

const CARD = `slots:
  title: [Title, Text]
  body: [Stack, Text, Badge]`;

test("table: clean nesting passes", async () => {
  const res = await validateSpec(await fixture("table", TABLE, `
    const meta: Meta<typeof Table> = { render: () => (
      <Table>
        <TableThead><TableTr><TableTh>User</TableTh></TableTr></TableThead>
        <TableTbody>
          {rows.map((r) => <TableTr key={r.id}><TableTd><Badge>{r.s}</Badge></TableTd></TableTr>)}
        </TableTbody>
      </Table>
    ) };`));
  assert.deepEqual(nesting(res), []);
});

test("table: seeded TableTd outside TableTr is flagged", async () => {
  const res = await validateSpec(await fixture("table", TABLE, `
    <Table>
      <TableTbody>
        <TableTd>orphan cell</TableTd>
      </TableTbody>
    </Table>`));
  const f = nesting(res);
  assert.equal(f.length, 1);
  assert.match(f[0]!.message, /<TableTd> is not allowed inside <TableTbody>/);
});

test("table: sub-component with no listed container is flagged", async () => {
  const res = await validateSpec(await fixture("table", TABLE, `<Card><TableTr /></Card>`));
  const f = nesting(res);
  assert.equal(f.length, 1);
  assert.match(f[0]!.message, /<TableTr> must be inside <TableThead> or <TableTbody>, found <Card>/);
});

test("card: slots-derived children pass, own sub-components allowed", async () => {
  const res = await validateSpec(await fixture("card", CARD, `
    <Card>
      <CardSection><div style={{ height: 120 }} /></CardSection>
      <Stack gap="xs"><Title order={4}>Hi</Title><Button>Not checked: not a direct child</Button></Stack>
    </Card>`));
  assert.deepEqual(nesting(res), []);
});

test("card: seeded non-slot child is flagged", async () => {
  const res = await validateSpec(await fixture("card", CARD, `<Card><Button>Go</Button></Card>`));
  const f = nesting(res);
  assert.equal(f.length, 1);
  assert.match(f[0]!.message, /<Button> is not allowed inside <Card>/);
});

test("jsxEdges: skips TS generics, normalises dotted tags, tracks lines", () => {
  const edges = jsxEdges(`const x = useState<Foo>(null);\n<Table.Tr>\n  <Table.Td>a</Table.Td><Table.Td />\n</Table.Tr>`);
  assert.deepEqual(edges, [
    { parent: undefined, child: "TableTr", line: 2 },
    { parent: "TableTr", child: "TableTd", line: 3 },
    { parent: "TableTr", child: "TableTd", line: 3 },
  ]);
});
