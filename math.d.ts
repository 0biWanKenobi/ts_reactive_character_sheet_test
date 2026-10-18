import type {
  AccessorNode, ArrayNode, AssignmentNode, BlockNode, ConditionalNode,
  ConstantNode, FunctionAssignmentNode, FunctionNode, IndexNode,
  MathJsInstance, MathNode, ObjectNode, OperatorNode, OperatorNodeFn,
  OperatorNodeOp, ParenthesisNode, RangeNode, RelationalNode, SymbolNode
} from 'mathjs';

// A discriminated union is needed for node.type to narrow the node itself.
// MathNode alone has type: string, so it cannot provide that narrowing.
export type BuiltinMathNode =
  | AccessorNode | ArrayNode | AssignmentNode | BlockNode | ConditionalNode
  | ConstantNode | FunctionAssignmentNode | FunctionNode<MathNode> | IndexNode
  | ObjectNode | OperatorNode<OperatorNodeOp, OperatorNodeFn>
  | ParenthesisNode | RangeNode | RelationalNode | SymbolNode;

declare module 'mathjs' {
  interface MathNode {
    // Built-in AST nodes; custom node callbacks can use the original overload.
    traverse(
      callback: (node: BuiltinMathNode, path: string, parent: BuiltinMathNode | null) => void
    ): void;
  }
}

// MathJS's inline typed property cannot be widened by declaration merging.
// Extend the instance interface while preserving typed's call signature.
export interface ExtendedMathJsInstance extends MathJsInstance {
  typed: MathJsInstance['typed'] & {
    addType: (type: { name: string; test: (value: unknown) => boolean }) => void;
    addConversion: <T>(conversion: {
      from: string;
      to: string;
      convert: (value: T) => number;
    }) => void;
  };
}
