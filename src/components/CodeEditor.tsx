"use client";

import Editor from "@monaco-editor/react";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: string;
}

const DEFAULT_CODE = `#include <iostream>
using namespace std;
int main() {

    return 0;
}
`;

export { DEFAULT_CODE };

export default function CodeEditor({ value, onChange, height = "400px" }: CodeEditorProps) {
  return (
    <Editor
      height={height}
      language="cpp"
      theme="vs-dark"
      value={value}
      onChange={(v) => onChange(v || "")}
      options={{
        fontSize: 14,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: "on",
        tabSize: 4,
        automaticLayout: true,
      }}
    />
  );
}
