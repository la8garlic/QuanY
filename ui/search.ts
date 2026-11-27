/** 与稿本搜索使用相同的 Unicode 大小写规则，匹配下标直接指向原文选区。 */
export function literalSearch(term: string) {
  return new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu");
}
