export const _LIST_BLOCKED_ROOTS_SQL = `
  WITH selected_root_graphs AS (
    SELECT
      dtr.root_version_id,
      dtr.root_digest,
      dtr.root_manifest_kind,
      manifest_graphs.graph_id
    FROM temp_direct_target_roots dtr
    CROSS JOIN manifest_graphs
    WHERE manifest_graphs.scan_id = ?
      AND manifest_graphs.digest = dtr.root_digest
  ),
  selected_graphs AS (
    SELECT DISTINCT
      selected_root_graphs.graph_id
    FROM selected_root_graphs
  ),
  retained_tagged_manifests AS (
    SELECT DISTINCT
      manifest_graphs.graph_id,
      m.version_id AS tagged_version_id,
      m.digest AS tagged_digest
    FROM selected_graphs
    CROSS JOIN manifest_graphs
    CROSS JOIN manifests m
    JOIN tags t
      ON t.scan_id = m.scan_id
     AND t.version_id = m.version_id
     AND t.is_digest_tag = 0
    WHERE manifest_graphs.scan_id = m.scan_id
      AND selected_graphs.graph_id = manifest_graphs.graph_id
      AND manifest_graphs.digest = m.digest
      AND m.scan_id = ?
      AND NOT EXISTS (
        SELECT 1
        FROM temp_direct_target_roots dtr
        WHERE dtr.root_digest = m.digest
      )
  ),
  protected_manifests AS (
    SELECT
      retained.graph_id,
      retained.tagged_version_id AS blocking_version_id,
      retained.tagged_digest AS blocking_digest,
      retained.tagged_digest AS digest,
      0 AS min_distance
    FROM retained_tagged_manifests retained

    UNION

    SELECT
      retained.graph_id,
      retained.tagged_version_id AS blocking_version_id,
      retained.tagged_digest AS blocking_digest,
      retained_overlap.descendant_digest AS digest,
      retained_overlap.min_distance
    FROM retained_tagged_manifests retained
    JOIN manifest_reachability retained_overlap
      ON retained_overlap.scan_id = ?
     AND retained_overlap.ancestor_digest = retained.tagged_digest
     AND retained_overlap.min_distance > 0
  ),
  ranked_blocks AS (
    SELECT
      root_graph.root_version_id AS blocked_version_id,
      root_graph.root_digest AS blocked_digest,
      retained.tagged_version_id AS blocking_version_id,
      retained.tagged_digest AS blocking_digest,
      COALESCE(retained_overlap.descendant_digest, helper_overlap.digest) AS overlap_digest,
      root_graph.root_manifest_kind AS overlap_manifest_kind,
      'overlap-with-retained-root' AS block_reason,
      ROW_NUMBER() OVER (
        PARTITION BY root_graph.root_digest, retained.tagged_digest
        ORDER BY
          COALESCE(retained_overlap.min_distance, helper_overlap.min_distance),
          COALESCE(retained_overlap.descendant_digest, helper_overlap.digest),
          root_graph.root_digest
      ) AS rn
    FROM selected_root_graphs root_graph
    JOIN retained_tagged_manifests retained
      ON retained.graph_id = root_graph.graph_id
     AND retained.tagged_digest <> root_graph.root_digest
    LEFT JOIN manifest_reachability retained_overlap
      ON retained_overlap.scan_id = ?
     AND retained_overlap.ancestor_digest = retained.tagged_digest
     AND retained_overlap.descendant_digest = root_graph.root_digest
     AND retained_overlap.min_distance > 0
    LEFT JOIN manifest_edges helper_edge INDEXED BY idx_manifest_edges_scan_parent
      ON helper_edge.scan_id = ?
     AND helper_edge.parent_digest = root_graph.root_digest
     AND helper_edge.edge_kind = 'digest-tag-referrer'
    LEFT JOIN protected_manifests helper_overlap
      ON helper_overlap.graph_id = root_graph.graph_id
     AND helper_overlap.blocking_digest = retained.tagged_digest
     AND helper_overlap.digest = helper_edge.child_digest
    WHERE retained_overlap.descendant_digest IS NOT NULL
       OR helper_overlap.digest IS NOT NULL
  )
  SELECT
    blocked_version_id,
    blocked_digest,
    blocking_version_id,
    blocking_digest,
    overlap_digest,
    overlap_manifest_kind,
    block_reason
  FROM ranked_blocks
  WHERE rn = 1
  ORDER BY blocked_digest, blocking_digest, overlap_digest
`
