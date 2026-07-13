import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

enum AppTab { home, payment, calendar, chat }

class AppBottomNavBar extends StatelessWidget {
	static const double horizontalMargin = 16;
	static const double contentGap = 0;
	static const double bottomMargin = 24;
	static const double cardHeight = 70;
	static const double innerPadding = 8;

	const AppBottomNavBar({
		required this.currentTab,
		required this.onTabSelected,
		super.key,
	});

	final AppTab currentTab;
	final ValueChanged<AppTab> onTabSelected;

	@override
	Widget build(BuildContext context) {
		final mq = MediaQuery.of(context);
		final sw = mq.size.width;
		final sh = mq.size.height;
		const baseW = 412.0;
		const baseH = 917.0;
		final sx = sw / baseW;
		final sy = sh / baseH;
		final sf = sx < sy ? sx : sy;

		double w(double v) => v * sx;
		double h(double v) => v * sy;
		double f(double v) => v * sf;

		return RepaintBoundary(
			child: Container(
				margin: EdgeInsets.fromLTRB(
					w(horizontalMargin),
					0,
					w(horizontalMargin),
					h(bottomMargin),
				),
				height: h(cardHeight),
				padding: EdgeInsets.all(w(innerPadding)),
				decoration: BoxDecoration(
					color: Colors.white,
					borderRadius: BorderRadius.circular(w(64)),
					border: Border.all(color: const Color(0x0F000000), width: 1),
					boxShadow: const [
						BoxShadow(
							color: Color(0x14000000),
							blurRadius: 24,
							spreadRadius: 0,
							offset: Offset(0, 4),
						),
					],
				),
				child: Row(
					children: [
						_NavItem(
							w: w,
							h: h,
							f: f,
							icon: LucideIcons.house,
							label: 'Home',
							isSelected: currentTab == AppTab.home,
							onTap: () => onTabSelected(AppTab.home),
						),
						_NavItem(
							w: w,
							h: h,
							f: f,
							icon: LucideIcons.wallet,
							label: 'Payment',
							isSelected: currentTab == AppTab.payment,
							onTap: () => onTabSelected(AppTab.payment),
						),
						_NavItem(
							w: w,
							h: h,
							f: f,
							icon: LucideIcons.calendarDays,
							label: 'Calendrer',
							isSelected: currentTab == AppTab.calendar,
							onTap: () => onTabSelected(AppTab.calendar),
						),
						_NavItem(
							w: w,
							h: h,
							f: f,
							icon: LucideIcons.messageCircle,
							label: 'Chat',
							isSelected: currentTab == AppTab.chat,
							onTap: () => onTabSelected(AppTab.chat),
						),
					],
				),
			),
		);
	}
}

class _NavItem extends StatelessWidget {
	const _NavItem({
		required this.w,
		required this.h,
		required this.f,
		required this.icon,
		required this.label,
		required this.isSelected,
		required this.onTap,
	});

	final double Function(double) w;
	final double Function(double) h;
	final double Function(double) f;
	final IconData icon;
	final String label;
	final bool isSelected;
	final VoidCallback onTap;

	@override
	Widget build(BuildContext context) {
		return Expanded(
			child: Material(
				color: Colors.transparent,
				child: InkWell(
					borderRadius: BorderRadius.circular(w(40)),
					onTap: onTap,
					child: AnimatedContainer(
						duration: const Duration(milliseconds: 180),
						curve: Curves.easeOutCubic,
						padding: EdgeInsets.symmetric(vertical: h(6)),
						decoration: BoxDecoration(
							color: isSelected ? const Color(0xFFDFE7FF) : Colors.transparent,
							borderRadius: BorderRadius.circular(w(40)),
						),
						child: Column(
							mainAxisSize: MainAxisSize.min,
							children: [
								Icon(
									icon,
									color: isSelected
											? const Color(0xFF2C59D8)
											: const Color(0xFF8C8C8C),
									size: w(24),
								),
                SizedBox(height: h(2)),
								Text(
									label,
									style: TextStyle(
										fontSize: f(12),
										color: isSelected
												? const Color(0xFF2C59D8)
												: const Color(0xFF818181),
										fontWeight: FontWeight.w400,
										fontFamily: 'Sans Serif',
									),
								),
							],
						),
					),
				),
			),
		);
	}
}
