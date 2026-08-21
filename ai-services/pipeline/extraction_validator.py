class ExtractionValidator:

    MAX_HOURS_PER_DAY = 24
    MAX_HOURS_PER_MONTH = 744

    def validate(
        self,
        normalized_data: dict
    ):

        errors = []
        warnings = []

        trades = normalized_data.get(
            "trades",
            []
        )

        seen_employee_ids = set()

        calculated_total = 0

        for trade in trades:

            trade_name = trade.get(
                "trade_name",
                "UNKNOWN"
            )

            workers = trade.get(
                "workers",
                []
            )

            for worker in workers:

                employee_id = worker.get(
                    "employee_id"
                )

                employee_name = worker.get(
                    "employee_name"
                )

                working_hours = float(
                    worker.get(
                        "working_hours",
                        0
                    )
                )

                amount = float(
                    worker.get(
                        "amount",
                        0
                    )
                )

                calculated_total += amount

                # Duplicate employee detection
                if employee_id:

                    if employee_id in seen_employee_ids:
                        warnings.append(
                            f"Duplicate employee id detected: "
                            f"{employee_id}"
                        )

                    seen_employee_ids.add(
                        employee_id
                    )

                # Impossible hour detection
                if (
                    working_hours >
                    self.MAX_HOURS_PER_MONTH
                ):
                    errors.append(
                        f"{employee_name} has "
                        f"{working_hours} hours "
                        f"which exceeds "
                        f"monthly limit."
                    )

                if working_hours < 0:
                    errors.append(
                        f"{employee_name} "
                        f"has negative hours."
                    )

                if amount < 0:
                    errors.append(
                        f"{employee_name} "
                        f"has negative amount."
                    )

            # Empty trade detection
            if len(workers) == 0:
                warnings.append(
                    f"{trade_name} "
                    f"contains no workers."
                )

        summary = normalized_data.get(
            "summary",
            {}
        )

        reported_total = (
            summary.get(
                "gross_total_aed"
            )
            or summary.get(
                "grand_total_amount"
            )
            or 0
        )

        difference = abs(
            calculated_total -
            reported_total
        )

        if difference > 1:
            warnings.append(
                f"Financial mismatch detected. "
                f"Calculated={calculated_total}, "
                f"Reported={reported_total}"
            )

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings,
            "calculated_total": calculated_total,
            "reported_total": reported_total
        }