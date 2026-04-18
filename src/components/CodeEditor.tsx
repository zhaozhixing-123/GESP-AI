"use client";

import { useRef, useCallback } from "react";
import Editor, { loader } from "@monaco-editor/react";

// 默认从 jsDelivr CDN 加载，国内无法访问，改用本地文件（构建时自动复制）
loader.config({
  paths: {
    vs: "/monaco-editor/min/vs",
  },
});

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: string;
  onSelectionChange?: (selected: string) => void;
  readOnly?: boolean;
}

// 1~4 级启蒙模板：最小、无头文件噪音
const DEFAULT_CODE_BEGINNER = `#include <iostream>
using namespace std;
int main() {

    return 0;
}
`;

// 5~8 级竞赛模板：万能头 + 关同步 + ios_base::sync
const DEFAULT_CODE_COMPETITIVE = `#include <bits/stdc++.h>
using namespace std;
int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    return 0;
}
`;

const DEFAULT_CODE = DEFAULT_CODE_BEGINNER;

/** 按题目 level 返回默认模板。level 未知时回落到启蒙模板。 */
function defaultCodeForLevel(level?: number | null): string {
  if (level != null && level >= 5) return DEFAULT_CODE_COMPETITIVE;
  return DEFAULT_CODE_BEGINNER;
}

export { DEFAULT_CODE, DEFAULT_CODE_BEGINNER, DEFAULT_CODE_COMPETITIVE, defaultCodeForLevel };

export default function CodeEditor({ value, onChange, height = "400px", onSelectionChange, readOnly = false }: CodeEditorProps) {
  const editorRef = useRef<any>(null);
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

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

    // 监听选中文本变化
    editor.onDidChangeCursorSelection(() => {
      if (!onSelectionChangeRef.current) return;
      const selection = editor.getSelection();
      if (!selection || selection.isEmpty()) {
        onSelectionChangeRef.current("");
      } else {
        const selected = editor.getModel()?.getValueInRange(selection) || "";
        onSelectionChangeRef.current(selected);
      }
    });
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
          readOnly,
        }}
      />
    </div>
  );
}
