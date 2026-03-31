"use client";

import { useRef } from "react";
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
  const editorRef = useRef<any>(null);

  return (
    <div
      onMouseEnter={() => editorRef.current?.updateOptions({ scrollbar: { handleMouseWheel: true } })}
      onMouseLeave={() => editorRef.current?.updateOptions({ scrollbar: { handleMouseWheel: false } })}
      style={{ height }}
    >
      <Editor
        height="100%"
        language="cpp"
        theme="vs-dark"
        value={value}
        onChange={(v) => onChange(v || "")}
        onMount={(editor) => { editorRef.current = editor; }}
        options={{
          fontSize: 14,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: "on",
          tabSize: 4,
          automaticLayout: true,
          scrollbar: { handleMouseWheel: false },
        }}
      />
    </div>
  );
}
