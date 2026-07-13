from collections import defaultdict


class DocumentNormalizer:

    def normalize(
        self,
        extraction_result: dict
    ) -> dict:

        normalized = {
            "document_metadata": {
                "document_type":
                    extraction_result.get(
                        "document_type"
                    ),

                "company_name":
                    extraction_result.get(
                        "company_name"
                    ),

                "project_name":
                    extraction_result.get(
                        "project_name"
                    ),

                "invoice_period":
                    extraction_result.get(
                        "invoice_period"
                    )
            },

            "trades": [],

            "summary":
                extraction_result.get(
                    "summary",
                    {}
                ),

            "confidence":
                extraction_result.get(
                    "confidence",
                    0
                )
        }

        trades_map = defaultdict(
            lambda: {
                "trade_name": "",
                "worker_count": 0,
                "total_hours": 0,
                "subtotal": 0,
                "workers": []
            }
        )

        raw_items = (
            extraction_result.get(
                "trades",
                []
            )
        )

        for item in raw_items:

            trade_name = (
                item.get("trade_name")
                or item.get("profession")
                or item.get("occupation")
                or item.get("skill")
                or item.get("craft")
                or item.get("category")
                or "UNKNOWN"
            )

            if "workers" in item:
                trades_map[
                    trade_name
                ] = item

                continue

            worker = {
                "employee_id":
                    item.get("employee_code")
                    or item.get("employee_id"),

                "employee_name":
                    item.get("employee_name"),

                "working_hours":
                    item.get("total_hours")
                    or item.get(
                        "working_hours",
                        0
                    ),

                "working_days":
                    item.get(
                        "working_days",
                        0
                    ),

                "rate":
                    item.get(
                        "rate",
                        0
                    ),

                "amount":
                    item.get(
                        "amount",
                        0
                    )
            }

            trades_map[
                trade_name
            ]["trade_name"] = trade_name

            trades_map[
                trade_name
            ]["workers"].append(
                worker
            )

            trades_map[
                trade_name
            ]["worker_count"
            ] += 1

            trades_map[
                trade_name
            ]["total_hours"
            ] += worker[
                "working_hours"
            ]

            trades_map[
                trade_name
            ]["subtotal"
            ] += worker[
                "amount"
            ]

        normalized[
            "trades"
        ] = list(
            trades_map.values()
        )

        return normalized