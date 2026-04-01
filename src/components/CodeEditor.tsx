"use client";

import { useRef, useCallback } from "react";
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

  const handleMount = useCallback((editor: any) => {
    editorRef.current = editor;

    // 默认关闭滚轮
    editor.updateOptions({ scrollbar: { handleMouseWheel: false } });

    // 获取 Monaco 的 DOM 容器
    const domNode = editor.getDomNode();
    if (domNode) {
      domNode.addEventListener("mouseenter", () => {
        editor.updateOptions({ scrollbar: { handleMouseWheel: true } });
      });
      domNode.addEventListener("mouseleave", () => {
        editor.updateOptions({ scrollbar: { handleMouseWheel: false } });
      });
    }
  }, []);

  return (
    <div style={{ height }}>
      <Editor
        height="100%"
        language="cpp"
        theme="vs-dark"
        value={value}
        onChange={(v) => onChange(v || "")}
        onMount={handleMount}
        options={{
          fontSize: 14,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: "on",
          tabSize: 4,
          automaticLayout: true,
        }}
      />
    </div>
  );
}
